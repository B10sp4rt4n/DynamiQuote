import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// Convierte de forma segura cualquier tipo numerico que pueda regresar una
// consulta $queryRaw (Decimal, bigint por COUNT/SUM, string, number) a number.
function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Folio atomico/consecutivo por tenant, igual que COT-XXXX y PKG-XXXX (ver
// CLAUDE.md "Convenciones de codigo").
async function nextOpportunityNumber(tenantId: string): Promise<string> {
  const rows = await prisma.opportunities.findMany({
    select: { opportunity_number: true },
    where: {
      opportunity_number: { startsWith: "OPP-" },
      tenant_id: tenantId,
    },
  });

  const lastNumber = rows.reduce((max, row) => {
    const current = Number.parseInt(row.opportunity_number.replace("OPP-", ""), 10);
    return Number.isFinite(current) ? Math.max(max, current) : max;
  }, 0);

  return `OPP-${String(lastNumber + 1).padStart(4, "0")}`;
}

// Identidad propia del trato -- nace automaticamente con cada cotizacion
// nueva (v1 de un quote_group_id nuevo). Sin UI todavia: solo plomeria de
// backend para que quotes/proposals ya nazcan enlazados a una Oportunidad.
// Acepta un cliente de transaccion opcional para crearse atomicamente junto
// con la cotizacion que la origina.
export async function createOpportunityForTenant(
  tenantId: string,
  input: { clientId: string | null; createdByUserId: string | null; title: string },
  client: PrismaClientOrTx = prisma,
): Promise<string> {
  const opportunityId = randomUUID();
  const opportunityNumber = await nextOpportunityNumber(tenantId);
  const now = new Date();

  await client.opportunities.create({
    data: {
      client_id: input.clientId,
      created_at: now,
      opportunity_id: opportunityId,
      opportunity_number: opportunityNumber,
      owner_user_id: input.createdByUserId,
      stage: "open",
      tenant_id: tenantId,
      title: input.title,
    },
  });

  return opportunityId;
}

export type OpportunityStage = "open" | "won" | "lost";

export type OpportunityWithStage = {
  amount: number;
  clientCompany: string | null;
  clientId: string | null;
  createdAt: string;
  expectedCloseDate: string | null;
  opportunityId: string;
  opportunityNumber: string;
  stage: OpportunityStage;
  title: string;
};

type OpportunityFinancials = {
  hasLost: boolean;
  hasWon: boolean;
  // true cuando la oportunidad tiene al menos una propuesta ligada y NINGUNA
  // sigue viva (todas descartadas, ninguna ganada/perdida) -- ver comentario
  // abajo sobre por que estas se excluyen por completo en vez de caer a
  // "open".
  isFullyDiscarded: boolean;
  lostAmount: number;
  openAmount: number;
  wonAmount: number;
};

// opportunities.stage nunca se actualiza en ningun lado del codigo (nace
// "open" y se queda ahi) -- el stage real se deriva del outcome de las
// propuestas ligadas: ganada si alguna gano, perdida si alguna perdio y
// ninguna gano, abierta en cualquier otro caso. El monto tampoco sale de
// opportunities.estimated_value (ningun codigo lo puebla, siempre NULL) --
// se calcula de proposal_items.subtotal_price de esas mismas propuestas,
// sumando solo las del outcome que aplica al stage resultante -- las
// descartadas nunca aportan a "openAmount": una propuesta descartada no es
// un trato abierto, es ruido de una version superada.
//
// Descartar es una accion consciente del usuario (alguien la marco asi a
// proposito), no un default ni un accidente -- por eso no se borra ni se
// oculta del todo (sigue existiendo, sigue siendo consultable). Pero
// tampoco debe conservar prioridad de visibilidad: ya no debe "estorbar"
// entre los tratos activos (Salvador, 2026-09-17: "las descartadas no
// deben tener prioridad de visibilidad... no deben permanecer visibles
// despues de seleccionadas como descartadas... no desaparece pero ya no
// me estorba"). Cuando TODAS las propuestas de una oportunidad estan
// descartadas y ninguna gano o perdio, la oportunidad completa se marca
// isFullyDiscarded para que attachDerivedStage la excluya del resultado
// en vez de mostrarla como "Abierta" vacia -- la propuesta y la
// oportunidad siguen intactas en BD, solo dejan de ocupar un lugar en el
// Pipeline. Compartido con getOpportunityPipelineSummaryByTenant para
// que ambos calculen igual.
async function getOpportunityFinancialsByIds(
  tenantId: string,
  opportunityIds: string[],
): Promise<Map<string, OpportunityFinancials>> {
  if (opportunityIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<
    Array<{
      has_lost: number;
      has_won: number;
      live_count: number;
      lost_amount: Prisma.Decimal | null;
      open_amount: Prisma.Decimal | null;
      opportunity_id: string;
      proposal_count: number;
      won_amount: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT
      p.opportunity_id,
      MAX(CASE WHEN p.outcome = 'won' THEN 1 ELSE 0 END) AS has_won,
      MAX(CASE WHEN p.outcome = 'lost' THEN 1 ELSE 0 END) AS has_lost,
      COUNT(DISTINCT p.proposal_id) AS proposal_count,
      COUNT(DISTINCT p.proposal_id) FILTER (WHERE p.outcome IS NULL) AS live_count,
      SUM(CASE WHEN p.outcome = 'won' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS won_amount,
      SUM(CASE WHEN p.outcome = 'lost' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS lost_amount,
      SUM(CASE WHEN p.outcome IS NULL THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS open_amount
    FROM proposals p
    LEFT JOIN proposal_items pi ON pi.proposal_id = p.proposal_id AND pi.status != 'deleted'
    WHERE p.tenant_id = ${tenantId} AND p.opportunity_id IN (${Prisma.join(opportunityIds)})
    GROUP BY p.opportunity_id
  `);

  const map = new Map<string, OpportunityFinancials>();
  for (const row of rows) {
    const hasWon = toNumber(row.has_won) > 0;
    const hasLost = toNumber(row.has_lost) > 0;
    const proposalCount = toNumber(row.proposal_count);
    const liveCount = toNumber(row.live_count);

    map.set(row.opportunity_id, {
      hasLost,
      hasWon,
      isFullyDiscarded: !hasWon && !hasLost && proposalCount > 0 && liveCount === 0,
      lostAmount: toNumber(row.lost_amount),
      openAmount: toNumber(row.open_amount),
      wonAmount: toNumber(row.won_amount),
    });
  }
  return map;
}

async function attachDerivedStage(
  tenantId: string,
  opportunities: Array<{
    client_id: string | null;
    created_at: Date;
    expected_close_date: Date | null;
    opportunity_id: string;
    opportunity_number: string;
    title: string;
  }>,
): Promise<OpportunityWithStage[]> {
  if (opportunities.length === 0) {
    return [];
  }

  const opportunityIds = opportunities.map((o) => o.opportunity_id);
  const financials = await getOpportunityFinancialsByIds(tenantId, opportunityIds);

  const clientIds = [...new Set(opportunities.map((o) => o.client_id).filter((id): id is string => Boolean(id)))];
  const clients =
    clientIds.length > 0
      ? await prisma.client.findMany({
          select: { client_id: true, company: true },
          where: { client_id: { in: clientIds }, tenant_id: tenantId },
        })
      : [];
  const clientCompanyById = new Map(clients.map((c) => [c.client_id, c.company]));

  return opportunities
    .filter((o) => !financials.get(o.opportunity_id)?.isFullyDiscarded)
    .map((o) => {
      const fin = financials.get(o.opportunity_id);
      const stage: OpportunityStage = fin?.hasWon ? "won" : fin?.hasLost ? "lost" : "open";
      const amount = fin ? (stage === "won" ? fin.wonAmount : stage === "lost" ? fin.lostAmount : fin.openAmount) : 0;

      return {
        amount,
        clientCompany: o.client_id ? (clientCompanyById.get(o.client_id) ?? null) : null,
        clientId: o.client_id,
        createdAt: o.created_at.toISOString(),
        expectedCloseDate: o.expected_close_date ? o.expected_close_date.toISOString() : null,
        opportunityId: o.opportunity_id,
        opportunityNumber: o.opportunity_number,
        stage,
        title: o.title,
      };
    });
}

// Todas las oportunidades de un cliente (para la Vista 360) -- a
// diferencia de getOpenOpportunitiesByClientForTenant, incluye tambien
// las ya ganadas/perdidas para ver el historial completo.
export async function getOpportunitiesByClientForTenant(
  tenantId: string,
  clientId: string,
): Promise<OpportunityWithStage[]> {
  const opportunities = await prisma.opportunities.findMany({
    orderBy: { created_at: "desc" },
    where: { client_id: clientId, tenant_id: tenantId },
  });

  return attachDerivedStage(tenantId, opportunities);
}

// Todas las oportunidades del tenant con su stage derivado -- para la
// vista de pipeline. Mismo criterio "ve lo tuyo vs ve todo" que el resto
// de la app, usando owner_user_id (quien la creo).
export async function getOpportunityPipelineByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<OpportunityWithStage[]> {
  const opportunities = await prisma.opportunities.findMany({
    orderBy: { created_at: "desc" },
    where: {
      tenant_id: tenantId,
      ...(canSeeAll ? {} : { OR: [{ owner_user_id: viewerUserId }, { owner_user_id: null }] }),
    },
  });

  return attachDerivedStage(tenantId, opportunities);
}

export type OpportunityPipelineStageSummary = {
  amount: number;
  count: number;
};

export type OpportunityPipelineSummary = {
  lost: OpportunityPipelineStageSummary;
  open: OpportunityPipelineStageSummary;
  won: OpportunityPipelineStageSummary;
};

// Resumen de pipeline (tarjetas + barra de proporcion): cuenta y monto real
// por stage derivado, usando el mismo calculo que attachDerivedStage
// (getOpportunityFinancialsByIds) para que tarjetas, barra y tabla nunca
// difieran entre si. Mismo criterio "ve lo tuyo vs ve todo" que
// getOpportunityPipelineByTenant.
export async function getOpportunityPipelineSummaryByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<OpportunityPipelineSummary> {
  const opportunities = await prisma.opportunities.findMany({
    select: { opportunity_id: true },
    where: {
      tenant_id: tenantId,
      ...(canSeeAll ? {} : { OR: [{ owner_user_id: viewerUserId }, { owner_user_id: null }] }),
    },
  });

  const opportunityIds = opportunities.map((o) => o.opportunity_id);
  const financials = await getOpportunityFinancialsByIds(tenantId, opportunityIds);

  const summary: OpportunityPipelineSummary = {
    lost: { amount: 0, count: 0 },
    open: { amount: 0, count: 0 },
    won: { amount: 0, count: 0 },
  };

  for (const opportunityId of opportunityIds) {
    const fin = financials.get(opportunityId);
    if (fin?.isFullyDiscarded) {
      continue;
    }
    if (fin?.hasWon) {
      summary.won.count += 1;
      summary.won.amount += fin.wonAmount;
    } else if (fin?.hasLost) {
      summary.lost.count += 1;
      summary.lost.amount += fin.lostAmount;
    } else {
      summary.open.count += 1;
      summary.open.amount += fin?.openAmount ?? 0;
    }
  }

  return summary;
}
