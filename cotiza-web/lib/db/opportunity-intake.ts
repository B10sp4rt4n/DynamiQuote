import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { intakeMissingFields, type OpportunityIntake, type OpportunityIntakeInput } from "@/lib/domain/opportunity-intake";
import { readIntakeMetadata } from "@/lib/domain/opportunity-intake-summary";

type Viewer = { userId: string; canSeeAll: boolean };
function scope(tenantId: string, opportunityId: string, viewer: Viewer) {
  return { tenant_id: tenantId, opportunity_id: opportunityId,
    ...(viewer.canSeeAll ? {} : { owner_user_id: viewer.userId }) };
}
export async function getOpportunityIntake(tenantId: string, opportunityId: string, viewer: Viewer): Promise<OpportunityIntake | null> {
  const row = await prisma.opportunities.findFirst({ where: scope(tenantId, opportunityId, viewer) });
  if (!row) return null;
  const data = readIntakeMetadata(row.intake_metadata);
  const text = (key: string) => typeof data?.[key] === "string" ? data[key] as string : "";
  const fields = { title: data ? text("confirmedTitle") : row.title, need: text("need"), source: text("source"), nextStep: text("nextStep") };
  return { ...fields, opportunityId, opportunityNumber: row.opportunity_number,
    clientCompany: text("companyName"), revision: Number(data?.revision ?? 0),
    managed: data !== null, missingFields: data ? intakeMissingFields(fields) : [] };
}
export async function saveOpportunityIntake(tenantId: string, opportunityId: string, viewer: Viewer, input: OpportunityIntakeInput) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`opportunity-intake:${tenantId}:${opportunityId}`}, 0))`;
    const row = await tx.opportunities.findFirst({ where: scope(tenantId, opportunityId, viewer) });
    if (!row) return "not_found" as const;
    const data = readIntakeMetadata(row.intake_metadata);
    if (!data) return "unmanaged" as const;
    if (Number(data.revision ?? 0) !== input.revision) return "conflict" as const;
    const now = new Date().toISOString();
    await tx.opportunities.update({ where: { opportunity_id: opportunityId, tenant_id: tenantId }, data: {
      ...(input.title ? { title: input.title } : {}),
      intake_metadata: { ...data, confirmedTitle: input.title, need: input.need, source: input.source, nextStep: input.nextStep,
        revision: input.revision + 1, updatedAt: now, updatedBy: viewer.userId,
        completedAt: intakeMissingFields(input).length === 0 ? now : null } as Prisma.InputJsonObject,
    } });
    return "updated" as const;
  });
}
