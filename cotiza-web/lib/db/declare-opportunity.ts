import "server-only";
import { prisma } from "./prisma";
import { createOpportunityForTenant } from "./opportunities";
import { z } from "zod";

import { declarationSchema } from "@/lib/domain/opportunity-declaration";
export { declarationSchema } from "@/lib/domain/opportunity-declaration";
export class DeclarationError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function declareOpportunity(tenantId: string, userId: string, input: z.infer<typeof declarationSchema>) {
  return prisma.$transaction(async tx => {
    // Shared with initial quote creation, which allocates the same opportunity folios.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quote-create:${tenantId}`}, 0))`;
    const client = await tx.client.findFirst({ where: { tenant_id: tenantId, client_id: input.clientId, active: true } });
    if (!client) throw new DeclarationError("Cliente no disponible", 404);
    const prior = await tx.opportunities.findFirst({ where: { tenant_id: tenantId, intake_metadata: { path: ["declarationId"], equals: input.creationId } } });
    if (prior) {
      if (prior.owner_user_id !== userId || prior.client_id !== input.clientId || prior.title !== input.title) throw new DeclarationError("Esta solicitud ya se utilizó con otros datos", 409);
      return { opportunityId: prior.opportunity_id, opportunityNumber: prior.opportunity_number, title: prior.title, clientId: client.client_id, clientCompany: client.company };
    }
    const opportunityId = await createOpportunityForTenant(tenantId, { clientId: client.client_id, createdByUserId: userId, title: input.title, intakeMetadata: {
      version: 1, kind: "opportunity-origin", declarationId: input.creationId, origin: "explicit-declaration", companyName: client.company,
      confirmedTitle: input.title, need: "", source: "", nextStep: "", revision: 0, createdBy: userId, createdAt: new Date().toISOString(),
    } }, tx);
    const row = await tx.opportunities.findFirstOrThrow({ where: { tenant_id: tenantId, opportunity_id: opportunityId } });
    return { opportunityId, opportunityNumber: row.opportunity_number, title: row.title, clientId: client.client_id, clientCompany: client.company };
  });
}
