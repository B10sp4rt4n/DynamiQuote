import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProposalRelationshipInput } from "@/lib/domain/proposal-relationship";

vi.mock("server-only", () => ({}));

const suite = process.env.COTIZA_WORKSPACE_NATIVE === "1" ? describe : describe.skip;

suite("commercial proposal relationships with a disposable database", () => {
  let db: typeof import("./prisma").prisma;
  let relationships: typeof import("./proposal-relationships");
  let opportunities: typeof import("./opportunities");
  let proposals: typeof import("./proposals");
  let kpis: typeof import("./proposal-kpis");
  let quotes: typeof import("./quotes");

  const actor = { userId: "synthetic-seller", isSuperAdmin: false, userRole: "owner" as const };
  const viewer = { userId: actor.userId, canSeeAll: true };

  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1") throw Error("Disposable local database required");
    ({ prisma: db } = await import("./prisma"));
    relationships = await import("./proposal-relationships");
    opportunities = await import("./opportunities");
    proposals = await import("./proposals");
    kpis = await import("./proposal-kpis");
    quotes = await import("./quotes");
  });

  afterAll(async () => db?.$disconnect());

  async function fixture() {
    const tenantId = randomUUID();
    const opportunityId = randomUUID();
    const now = new Date();
    await db.tenant.create({ data: { tenant_id: tenantId, name: tenantId, slug: tenantId, created_at: now } });
    await db.opportunities.create({ data: {
      tenant_id: tenantId, opportunity_id: opportunityId, opportunity_number: "SYN-001", title: "Synthetic renewal",
      owner_user_id: actor.userId, created_at: now, intake_metadata: { note: "preserve" },
    } });
    async function makeProposal(amount: number, owner = actor.userId, currency = "USD") {
      const quoteId = randomUUID();
      const proposalId = randomUUID();
      await db.quote.create({ data: { quote_id: quoteId, quote_group_id: quoteId, tenantId, opportunity_id: opportunityId, total_revenue: amount } });
      await db.proposals.create({ data: {
        proposal_id: proposalId, tenant_id: tenantId, opportunity_id: opportunityId, origin: quoteId,
        status: "approved", created_at: now, created_by: "Synthetic seller", created_by_user_id: owner,
      } });
      await db.formal_proposals.create({ data: {
        proposal_doc_id: randomUUID(), proposal_number: randomUUID(), proposal_id: proposalId, quote_id: quoteId, tenant_id: tenantId,
        issued_date: now, created_at: now, issuer_company: "Synthetic vendor", recipient_company: "Synthetic account", currency, status: "approved",
      } });
      await db.proposal_items.create({ data: {
        item_id: randomUUID(), tenant_id: tenantId, proposal_id: proposalId, item_number: 1, quantity: 1, cost_unit: 50,
        price_unit: amount, subtotal_cost: 50, subtotal_price: amount, status: "active", created_at: now,
      } });
      return proposalId;
    }
    const first = await makeProposal(100);
    const second = await makeProposal(150);
    return {
      tenantId, opportunityId, first, second, makeProposal,
      read: async () => (await opportunities.getOpportunityPipelineByTenant(tenantId))[0],
      save: (input: Omit<ProposalRelationshipInput, "proposalIds"> & { proposalIds?: string[] }) =>
        relationships.setProposalRelationship(tenantId, opportunityId, viewer, { proposalIds: [first, second], ...input }),
      report: () => kpis.getProposalKpiSummaryByTenant(tenantId),
      close: (id: string, outcome: "won" | "lost") => proposals.setProposalOutcomeByTenant(tenantId, id, outcome, actor, true),
    };
  }

  it("counts only the selected revision, preserves original documents and audits the classification", async () => {
    const f = await fixture();
    expect((await f.read()).amount).toBe(250);
    const input = { mode: "revision", preferredProposalId: f.second, revision: 0 } as const;
    expect(await f.save(input)).toBe("updated");
    expect(await f.save(input)).toBe("updated");
    expect(await f.save({ ...input, preferredProposalId: f.first })).toBe("conflict");
    expect(await f.read()).toMatchObject({ stage: "open", amount: 150, proposalRelationship: { amounts: [{ currency: "USD", value: 150 }] } });
    expect(await f.report()).toMatchObject({ totalCount: 2, proposedAmount: 150 });
    expect(await quotes.getQuoteDashboardSnapshotByTenant(f.tenantId)).toMatchObject({ activeQuoteCount: 2, totalRevenue: 150 });
    expect(await db.proposals.count({ where: { tenant_id: f.tenantId, outcome: null, status: "approved" } })).toBe(2);
    expect(await db.proposal_audit_events.count({ where: { tenant_id: f.tenantId, event_type: "proposal_relationship_changed" } })).toBe(2);
    expect((await db.opportunities.findUniqueOrThrow({ where: { opportunity_id: f.opportunityId } })).intake_metadata).toMatchObject({ note: "preserve" });
    await f.makeProposal(200);
    expect(await f.read()).toMatchObject({ amount: 150, proposalRelationship: { unclassifiedCount: 1 } });
    expect(await f.report()).toMatchObject({ proposedAmount: 150 });
  });

  it("shows the range, then only the preference, then the actual exclusive winner", async () => {
    const f = await fixture();
    expect(await f.save({ mode: "alternatives", preferredProposalId: null, revision: 0 })).toBe("updated");
    expect(await f.read()).toMatchObject({ amount: 0, proposalRelationship: { range: { currency: "USD", minimum: 100, maximum: 150 } } });
    expect(await f.report()).toMatchObject({ proposedAmount: 0 });
    expect(await f.save({ mode: "alternatives", preferredProposalId: f.second, revision: 1 })).toBe("updated");
    expect(await f.read()).toMatchObject({ amount: 150, proposalRelationship: { pendingChoice: false } });
    expect(await f.close(f.first, "won")).toBe("updated");
    expect(await f.close(f.second, "won")).toBe("business_already_won");
    expect(await f.read()).toMatchObject({ stage: "won", amount: 100 });
    expect(await f.report()).toMatchObject({ proposedAmount: 100, wonAmount: 100 });
    expect(await f.save({ mode: "complements", preferredProposalId: null, revision: 2 })).toBe("decided");
  });

  it("accumulates complementary amounts and allows both documented wins", async () => {
    const f = await fixture();
    expect(await f.save({ mode: "complements", preferredProposalId: null, revision: 0 })).toBe("updated");
    expect(await f.read()).toMatchObject({ stage: "open", amount: 250 });
    expect(await f.close(f.first, "won")).toBe("updated");
    expect(await f.read()).toMatchObject({ stage: "won", amount: 100 });
    expect(await f.close(f.second, "won")).toBe("updated");
    expect(await f.read()).toMatchObject({ stage: "won", amount: 250 });
    expect(await f.report()).toMatchObject({ wonAmount: 250 });
    const unclassified = await f.makeProposal(200);
    expect(await f.close(unclassified, "won")).toBe("business_already_won");
    expect(await f.read()).toMatchObject({ stage: "won", amount: 250 });
  });

  it("rejects stale membership and foreign sellers and keeps currencies separate", async () => {
    const f = await fixture();
    const third = await f.makeProposal(210, "other-seller", "MXN");
    const input = { mode: "complements", preferredProposalId: null, revision: 0, proposalIds: [f.first, f.second, third] } as const;
    expect(await f.save({ ...input, proposalIds: [f.first, f.second] })).toBe("conflict");
    expect(await relationships.setProposalRelationship(randomUUID(), f.opportunityId, viewer, { ...input, proposalIds: [...input.proposalIds] })).toBe("not_found");
    expect(await relationships.setProposalRelationship(f.tenantId, f.opportunityId, { ...viewer, canSeeAll: false }, { ...input, proposalIds: [...input.proposalIds] })).toBe("not_found");
    expect(await f.save({ ...input, proposalIds: [...input.proposalIds] })).toBe("updated");
    expect(await f.read()).toMatchObject({ amount: 0, proposalRelationship: { amounts: expect.arrayContaining([{ currency: "USD", value: 250 }, { currency: "MXN", value: 210 }]) } });
    expect((await opportunities.getOpportunityPipelineByTenant(f.tenantId, actor.userId, false))[0]).toMatchObject({
      amount: 250, proposalRelationship: { amounts: [{ currency: "USD", value: 250 }] },
    });
  });
});
