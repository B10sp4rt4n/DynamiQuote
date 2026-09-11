import "server-only";

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

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
