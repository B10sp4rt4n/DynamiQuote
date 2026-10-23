import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export class TenantRelationError extends Error {
  constructor() { super("Cliente u oportunidad no disponible para esta empresa"); }
}

export async function assertOpportunityOwnerForTenant(
  tenantId: string, clientId: string, opportunityId: string | null | undefined,
  viewerUserId: string | null, canSeeAll: boolean,
): Promise<void> {
  if (!opportunityId || canSeeAll) return;
  const opportunity = await prisma.opportunities.findFirst({
    select: { opportunity_id: true },
    where: {
      opportunity_id: opportunityId, client_id: clientId, tenant_id: tenantId,
      OR: [{ owner_user_id: viewerUserId }, { owner_user_id: null }],
    },
  });
  if (!opportunity) throw new TenantRelationError();
}

// Shared by HTTP and internal writers. Never resolve a foreign ID globally.
export async function assertClientOpportunityForTenant(
  tenantId: string,
  clientId: string | null,
  opportunityId?: string | null,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  if (clientId) {
    const client = await db.client.findFirst({ select: { client_id: true }, where: { client_id: clientId, tenant_id: tenantId } });
    if (!client) throw new TenantRelationError();
  }
  if (opportunityId) {
    const opportunity = await db.opportunities.findFirst({
      select: { opportunity_id: true },
      where: { opportunity_id: opportunityId, tenant_id: tenantId, client_id: clientId },
    });
    if (!opportunity) throw new TenantRelationError();
  }
}
