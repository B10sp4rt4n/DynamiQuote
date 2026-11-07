import "server-only";
import { Prisma } from "@prisma/client";
import { optionSetSchema } from "@/lib/domain/commercial-options";

// Called inside the decision transaction, after the tenant's win lock.
// Membership only prevents a second win; it never grants document access.
export async function hasAnotherBusinessWin(
  tx: Prisma.TransactionClient,
  tenantId: string,
  proposal: { proposal_id: string; opportunity_id: string | null; origin: string | null },
): Promise<boolean> {
  const origin = proposal.origin ? await tx.quote.findFirst({
    where: { tenantId, quote_id: proposal.origin },
    select: { opportunity_id: true, quote_group_id: true, quote_id: true },
  }) : null;
  const opportunityId = proposal.opportunity_id ?? origin?.opportunity_id;
  const members = new Set<string>(opportunityId ? [opportunityId] : []);
  if (opportunityId) {
    const roots = await tx.quote.findMany({
      where: { tenantId, input_metadata: { path: ["commercialOptionsSet"], not: Prisma.AnyNull } },
      select: { input_metadata: true },
    });
    const sets = roots.map(root => optionSetSchema.safeParse((root.input_metadata as Prisma.JsonObject)?.commercialOptionsSet));
    // Resolve overlapping declared sets conservatively, independent of root order.
    let changed = true;
    while (changed) {
      changed = false;
      for (const parsed of sets) {
        if (!parsed.success || !parsed.data.memberOpportunityIds.some(id => members.has(id))) continue;
        for (const id of parsed.data.memberOpportunityIds) if (!members.has(id)) { members.add(id); changed = true; }
      }
    }
  }
  const relatedQuotes = await tx.quote.findMany({
    where: { tenantId, OR: [
      ...(members.size ? [{ opportunity_id: { in: [...members] } }] : []),
      ...(origin ? [{ quote_group_id: origin.quote_group_id ?? origin.quote_id }, { quote_id: origin.quote_id }] : []),
    ] }, select: { quote_id: true },
  });
  if (!members.size && !relatedQuotes.length) return false;
  return Boolean(await tx.proposals.findFirst({
    where: { tenant_id: tenantId, proposal_id: { not: proposal.proposal_id }, outcome: "won", OR: [
      ...(members.size ? [{ opportunity_id: { in: [...members] } }] : []),
      ...(relatedQuotes.length ? [{ origin: { in: relatedQuotes.map(q => q.quote_id) } }] : []),
    ] }, select: { proposal_id: true },
  }));
}
