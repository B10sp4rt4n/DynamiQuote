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
  clientCompany: string | null;
  clientId: string | null;
  createdAt: string;
  estimatedValue: number | null;
  expectedCloseDate: string | null;
  opportunityId: string;
  opportunityNumber: string;
  stage: OpportunityStage;
  title: string;
};

// opportunities.stage nunca se actualiza en ningun lado del codigo (nace
// "open" y se queda ahi) -- el stage real se deriva del outcome de las
// propuestas ligadas: ganada si alguna gano, perdida si alguna perdio y
// ninguna gano, abierta en cualquier otro caso. Calculado en tiempo real,
// sin tocar el schema.
function deriveOpportunityStage(outcomes: Array<string | null>): OpportunityStage {
  if (outcomes.includes("won")) return "won";
  if (outcomes.includes("lost")) return "lost";
  return "open";
}

async function attachDerivedStage(
  tenantId: string,
  opportunities: Array<{
    client_id: string | null;
    created_at: Date;
    estimated_value: Prisma.Decimal | null;
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
  const proposals = await prisma.proposals.findMany({
    select: { opportunity_id: true, outcome: true },
    where: { opportunity_id: { in: opportunityIds }, tenant_id: tenantId },
  });

  const outcomesByOpportunity = new Map<string, Array<string | null>>();
  for (const proposal of proposals) {
    if (!proposal.opportunity_id) continue;
    const list = outcomesByOpportunity.get(proposal.opportunity_id) ?? [];
    list.push(proposal.outcome);
    outcomesByOpportunity.set(proposal.opportunity_id, list);
  }

  const clientIds = [...new Set(opportunities.map((o) => o.client_id).filter((id): id is string => Boolean(id)))];
  const clients =
    clientIds.length > 0
      ? await prisma.client.findMany({
          select: { client_id: true, company: true },
          where: { client_id: { in: clientIds }, tenant_id: tenantId },
        })
      : [];
  const clientCompanyById = new Map(clients.map((c) => [c.client_id, c.company]));

  return opportunities.map((o) => ({
    clientCompany: o.client_id ? (clientCompanyById.get(o.client_id) ?? null) : null,
    clientId: o.client_id,
    createdAt: o.created_at.toISOString(),
    estimatedValue: o.estimated_value !== null ? Number(o.estimated_value) : null,
    expectedCloseDate: o.expected_close_date ? o.expected_close_date.toISOString() : null,
    opportunityId: o.opportunity_id,
    opportunityNumber: o.opportunity_number,
    stage: deriveOpportunityStage(outcomesByOpportunity.get(o.opportunity_id) ?? []),
    title: o.title,
  }));
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
// por stage derivado. El monto se calcula de proposal_items.subtotal_price
// (nunca de opportunities.estimated_value -- ese campo no lo puebla ningun
// codigo, siempre queda NULL). Ganadas/Perdidas suman solo las propuestas con
// ese outcome; Abiertas suma todas las propuestas ligadas sin outcome
// definitivo. Mismo criterio "ve lo tuyo vs ve todo" que
// getOpportunityPipelineByTenant.
export async function getOpportunityPipelineSummaryByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<OpportunityPipelineSummary> {
  const scopeFilter = canSeeAll
    ? Prisma.empty
    : Prisma.sql`AND (o.owner_user_id = ${viewerUserId} OR o.owner_user_id IS NULL)`;

  const rows = await prisma.$queryRaw<
    Array<{
      has_lost: number;
      has_won: number;
      lost_amount: Prisma.Decimal | null;
      open_amount: Prisma.Decimal | null;
      opportunity_id: string;
      won_amount: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT
      o.opportunity_id,
      MAX(CASE WHEN p.outcome = 'won' THEN 1 ELSE 0 END) AS has_won,
      MAX(CASE WHEN p.outcome = 'lost' THEN 1 ELSE 0 END) AS has_lost,
      SUM(CASE WHEN p.outcome = 'won' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS won_amount,
      SUM(CASE WHEN p.outcome = 'lost' THEN COALESCE(pi.subtotal_price, 0) ELSE 0 END) AS lost_amount,
      SUM(COALESCE(pi.subtotal_price, 0)) AS open_amount
    FROM opportunities o
    LEFT JOIN proposals p ON p.opportunity_id = o.opportunity_id AND p.tenant_id = o.tenant_id
    LEFT JOIN proposal_items pi ON pi.proposal_id = p.proposal_id AND pi.status != 'deleted'
    WHERE o.tenant_id = ${tenantId}
      ${scopeFilter}
    GROUP BY o.opportunity_id
  `);

  const summary: OpportunityPipelineSummary = {
    lost: { amount: 0, count: 0 },
    open: { amount: 0, count: 0 },
    won: { amount: 0, count: 0 },
  };

  for (const row of rows) {
    if (toNumber(row.has_won) > 0) {
      summary.won.count += 1;
      summary.won.amount += toNumber(row.won_amount);
    } else if (toNumber(row.has_lost) > 0) {
      summary.lost.count += 1;
      summary.lost.amount += toNumber(row.lost_amount);
    } else {
      summary.open.count += 1;
      summary.open.amount += toNumber(row.open_amount);
    }
  }

  return summary;
}
