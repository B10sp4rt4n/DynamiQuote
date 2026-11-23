import "server-only";

import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { optionSetSchema } from "@/lib/domain/commercial-options";
import { readDisposition } from "@/lib/domain/opportunity-disposition";
import {
  isLiveProposal, proposalRelationshipInputSchema, readProposalRelationship, resolveProposalRelationship,
  type ProposalRelationship, type ProposalRelationshipInput,
} from "@/lib/domain/proposal-relationship";
import { prisma } from "./prisma";
import { lockWinPolicy } from "./won-consolidation";

type Tx = Prisma.TransactionClient;
type RelationshipSource = { opportunityId: string; relationship: ProposalRelationship };
type RelationshipProjection = ReturnType<typeof resolveProposalRelationship> & {
  quotesByProposal: Map<string, string>;
  proposalIds: string[];
};

async function readProposals(db: Tx, tenantId: string, opportunityIds: string[]) {
  return db.proposals.findMany({
    where: { tenant_id: tenantId, opportunity_id: { in: opportunityIds } },
    select: {
      proposal_id: true, opportunity_id: true, outcome: true, outcome_at: true, status: true, origin: true,
      created_by_user_id: true, invoice_uuid: true, invoice_status: true, invoice_draft_id: true, invoice_stamped_at: true,
      formal_proposals: {
        where: { tenant_id: tenantId },
        orderBy: [{ created_at: "desc" }, { proposal_doc_id: "desc" }],
        take: 1,
        select: { quote_id: true, currency: true, status: true },
      },
    },
  });
}

export async function getProposalRelationshipProjections(
  tenantId: string, sources: RelationshipSource[], viewerUserId?: string | null, includeAmounts = true,
): Promise<Map<string, RelationshipProjection>> {
  if (!sources.length) return new Map();
  const rows = await readProposals(prisma, tenantId, sources.map(source => source.opportunityId));
  const visible = (row: typeof rows[number]) => viewerUserId === undefined || row.created_by_user_id === null || row.created_by_user_id === viewerUserId;
  const visibleIds = rows.filter(visible).map(row => row.proposal_id);
  const totals = includeAmounts && visibleIds.length ? await prisma.proposal_items.groupBy({
    by: ["proposal_id"],
    where: { tenant_id: tenantId, proposal_id: { in: visibleIds }, status: { not: "deleted" } },
    _count: { _all: true, subtotal_price: true },
    _sum: { subtotal_price: true },
  }) : [];
  const amounts = new Map(totals.flatMap(row => row._count._all === row._count.subtotal_price && row._sum.subtotal_price !== null
    ? [[row.proposal_id, Number(row._sum.subtotal_price)] as const] : []));

  return new Map(sources.map(({ opportunityId, relationship }) => {
    const proposals = rows.filter(row => row.opportunity_id === opportunityId);
    const quotesByProposal = new Map<string, string>();
    const related = proposals.map(row => {
      const formal = row.formal_proposals[0];
      const quoteId = formal?.quote_id ?? row.origin;
      if (quoteId) quotesByProposal.set(row.proposal_id, quoteId);
      const currency = formal?.currency?.trim().toUpperCase();
      return {
        id: row.proposal_id,
        outcome: row.outcome,
        decidedAt: row.outcome_at,
        active: isLiveProposal(row.outcome, formal?.status ?? row.status),
        visible: visible(row),
        amount: amounts.get(row.proposal_id) ?? null,
        currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
      };
    });
    return [opportunityId, { ...resolveProposalRelationship(relationship, related), quotesByProposal, proposalIds: proposals.map(row => row.proposal_id) }] as const;
  }));
}

export async function getProposalRelationshipReportingExclusions(tenantId: string) {
  const opportunities = await prisma.opportunities.findMany({
    where: { tenant_id: tenantId, intake_metadata: { path: ["proposalRelationship"], not: Prisma.AnyNull } },
    select: { opportunity_id: true, intake_metadata: true },
  });
  const sources = opportunities.flatMap(row => {
    const relationship = readProposalRelationship(row.intake_metadata);
    return relationship && relationship.mode !== "unclassified" ? [{ opportunityId: row.opportunity_id, relationship }] : [];
  });
  const projections = await getProposalRelationshipProjections(tenantId, sources, undefined, false);
  const quoteIds = new Set<string>();
  const offerIds: string[] = [];
  const decisionIds: string[] = [];
  if (!projections.size) return { quoteIds, offerIds, decisionIds };

  const quotes = await prisma.quote.findMany({
    where: { tenantId, opportunity_id: { in: [...projections.keys()] } },
    select: { quote_id: true, quote_group_id: true, opportunity_id: true },
  });
  for (const [opportunityId, projection] of projections) {
    const offers = new Set(projection.offers.map(row => row.id));
    const decisions = new Set(projection.decisions.map(row => row.id));
    for (const proposalId of projection.proposalIds) {
      if (!offers.has(proposalId)) offerIds.push(proposalId);
      if (!decisions.has(proposalId)) decisionIds.push(proposalId);
    }
    const linkedQuoteIds = new Set(projection.quotesByProposal.values());
    const includedQuoteIds = new Set(projection.offers.map(row => projection.quotesByProposal.get(row.id)));
    const businessQuotes = quotes.filter(quote => quote.opportunity_id === opportunityId);
    const groupIds = new Set(businessQuotes.filter(quote => linkedQuoteIds.has(quote.quote_id)).map(quote => quote.quote_group_id ?? quote.quote_id));
    for (const quote of businessQuotes) {
      if (groupIds.has(quote.quote_group_id ?? quote.quote_id) && !includedQuoteIds.has(quote.quote_id)) quoteIds.add(quote.quote_id);
    }
  }
  return { quoteIds, offerIds, decisionIds };
}

type Viewer = { userId: string; canSeeAll: boolean };
export async function setProposalRelationship(tenantId: string, opportunityId: string, viewer: Viewer, input: ProposalRelationshipInput) {
  const parsed = proposalRelationshipInputSchema.safeParse(input);
  if (!parsed.success) return "invalid" as const;
  return prisma.$transaction(async tx => {
    // Match outcome/consolidation lock order before touching commercial metadata.
    await lockWinPolicy(tx, tenantId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`business-win:${tenantId}`}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`opportunity-intake:${tenantId}:${opportunityId}`}, 0))`;
    const opportunity = await tx.opportunities.findFirst({
      where: { tenant_id: tenantId, opportunity_id: opportunityId, ...(viewer.canSeeAll ? {} : { owner_user_id: viewer.userId }) },
    });
    if (!opportunity) return "not_found" as const;
    const legacy = await tx.quote.findMany({
      where: { tenantId, input_metadata: { path: ["commercialOptionsSet"], not: Prisma.AnyNull } },
      select: { input_metadata: true },
    });
    if (legacy.some(row => {
      const result = optionSetSchema.safeParse((row.input_metadata as Prisma.JsonObject)?.commercialOptionsSet);
      return result.success && result.data.memberOpportunityIds.includes(opportunityId);
    })) return "legacy" as const;
    const proposals = await readProposals(tx, tenantId, [opportunityId]);
    if (!viewer.canSeeAll && proposals.some(row => row.created_by_user_id !== null && row.created_by_user_id !== viewer.userId)) return "not_found" as const;
    const before = readProposalRelationship(opportunity.intake_metadata);
    const disposition = readDisposition(opportunity.intake_metadata);
    if (disposition && disposition.state !== "open") return "decided" as const;
    if (proposals.some(row => row.outcome === "won" || row.outcome === "lost" || row.invoice_status || row.invoice_uuid || row.invoice_draft_id || row.invoice_stamped_at)) return "decided" as const;

    const proposalIds = [...input.proposalIds].sort();
    const same = before?.mode === input.mode && before.preferredProposalId === input.preferredProposalId
      && [...before.proposalIds].sort().join("\0") === proposalIds.join("\0");
    if (same) return "updated" as const;
    if ((before?.revision ?? 0) !== input.revision) return "conflict" as const;
    const activeIds = proposals.filter(row => isLiveProposal(row.outcome, row.formal_proposals[0]?.status ?? row.status))
      .map(row => row.proposal_id).sort();
    if (input.mode !== "unclassified" && activeIds.join("\0") !== proposalIds.join("\0")) return "conflict" as const;

    const now = new Date();
    const next: ProposalRelationship = { ...input, proposalIds, version: 1, revision: input.revision + 1, changedAt: now.toISOString(), changedBy: viewer.userId };
    const metadata = (opportunity.intake_metadata && typeof opportunity.intake_metadata === "object" && !Array.isArray(opportunity.intake_metadata)
      ? opportunity.intake_metadata : {}) as Prisma.JsonObject;
    await tx.opportunities.update({
      where: { tenant_id: tenantId, opportunity_id: opportunityId },
      data: { intake_metadata: { ...metadata, proposalRelationship: next } },
    });
    const payload = JSON.stringify({ opportunityId, previous: before, relationship: next, actorUserId: viewer.userId });
    const proposalIdsToAudit = new Set([...proposalIds, ...(before?.proposalIds ?? [])]);
    await tx.proposal_audit_events.createMany({ data: proposals.filter(row => proposalIdsToAudit.has(row.proposal_id)).map(row => ({
      tenant_id: tenantId, proposal_id: row.proposal_id, event_id: randomUUID(), created_at: now,
      event_type: "proposal_relationship_changed", event_hash: createHash("sha256").update(payload).digest("hex"), payload,
    })) });
    return "updated" as const;
  });
}
