import "server-only";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getCommercialOptionSets } from "./commercial-options";
import { dispositionSchema, readDisposition, type DispositionInput } from "@/lib/domain/opportunity-disposition";

type Viewer = { userId: string; canSeeAll: boolean };
export async function setOpportunityDisposition(tenantId: string, opportunityId: string, viewer: Viewer, input: DispositionInput) {
  const parsed = dispositionSchema.safeParse(input);
  if (!parsed.success) return "invalid" as const;
  // Membership is resolved only from opportunities already authorized for this actor.
  const visible = await prisma.opportunities.findMany({ where: { tenant_id: tenantId,
    ...(viewer.canSeeAll ? {} : { owner_user_id: viewer.userId }) }, select: { opportunity_id: true } });
  if (!visible.some(o => o.opportunity_id === opportunityId)) return "not_found" as const;
  const sets = await getCommercialOptionSets(tenantId, visible.map(o => o.opportunity_id));
  if (sets.some(s => s.set.memberOpportunityIds.includes(opportunityId) && s.set.canonicalOpportunityId !== opportunityId)) return "conflict" as const;
  const members = sets.find(s => s.set.canonicalOpportunityId === opportunityId)?.set.memberOpportunityIds ?? [opportunityId];
  return prisma.$transaction(async tx => {
    for (const id of [...members].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`opportunity-intake:${tenantId}:${id}`}, 0))`;
    }
    const rows = await tx.$queryRaw<Array<{ opportunity_id: string }>>(Prisma.sql`SELECT opportunity_id FROM opportunities WHERE tenant_id=${tenantId} AND opportunity_id IN (${Prisma.join(members)}) ORDER BY opportunity_id FOR UPDATE`);
    if (rows.length !== members.length) return "conflict" as const;
    const opportunity = await tx.opportunities.findFirst({ where: { tenant_id: tenantId, opportunity_id: opportunityId,
      ...(viewer.canSeeAll ? {} : { owner_user_id: viewer.userId }) } });
    if (!opportunity) return "not_found" as const;
    const previous = readDisposition(opportunity.intake_metadata);
    if ((previous?.revision ?? 0) !== input.revision) return "conflict" as const;
    // Customer decisions take precedence. Reactivating/reclassifying an actual
    // win/loss must use the existing proposal outcome flow with its audit trail.
    if (await tx.proposals.count({ where: { tenant_id: tenantId, opportunity_id: { in: members }, outcome: { in: ["won", "lost"] } } })) return "decided" as const;
    if (input.state === "paused" && !opportunity.client_id) return "client_required" as const;
    const now = new Date();
    if (previous?.taskId) await tx.tasks.updateMany({ where: { tenant_id: tenantId, task_id: previous.taskId, completed_at: null }, data: { completed_at: now } });
    let taskId: string | null = null;
    if (input.state === "paused") {
      taskId = randomUUID();
      await tx.tasks.create({ data: { task_id: taskId, tenant_id: tenantId, client_id: opportunity.client_id!,
        opportunity_id: opportunityId, description: `Retomar ${opportunity.opportunity_number}: ${input.reason}`,
        due_date: new Date(`${input.resumeOn}T00:00:00Z`), created_at: now, created_by_user_id: viewer.userId } });
    }
    const next = { state: input.state, reason: input.reason, resumeOn: input.resumeOn ?? null,
      changedAt: now.toISOString(), changedBy: viewer.userId, revision: input.revision + 1, taskId };
    for (const id of members) {
      const row = await tx.opportunities.findUniqueOrThrow({ where: { opportunity_id: id } });
      const metadata = (row.intake_metadata && typeof row.intake_metadata === "object" && !Array.isArray(row.intake_metadata) ? row.intake_metadata : {}) as Prisma.JsonObject;
      const history = Array.isArray(metadata.commercialDispositionHistory) ? metadata.commercialDispositionHistory : [];
      await tx.opportunities.update({ where: { tenant_id: tenantId, opportunity_id: id }, data: {
        stage: input.state, closed_at: ["lost", "no_decision"].includes(input.state) ? now : null,
        intake_metadata: { ...metadata, commercialDisposition: next, commercialDispositionHistory: [...history, next] } as Prisma.InputJsonObject,
      } });
    }
    return "updated" as const;
  });
}
