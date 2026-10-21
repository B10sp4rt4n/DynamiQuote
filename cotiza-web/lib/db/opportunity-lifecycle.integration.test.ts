import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Opt-in only: use an empty disposable local Postgres database initialized
// from prisma/schema.prisma plus the manual migration. Never uses the app's
// DATABASE_URL by accident. See prisma/manual/README.md.
const testUrl = process.env.COTIZA_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
let db: typeof import("./prisma").prisma;
let proposals: typeof import("./proposals");
let opportunities: typeof import("./opportunities");
let kpis: typeof import("./proposal-kpis");
const actor = { isSuperAdmin: false, userId: "lifecycle-seller", userRole: "owner" as const };

suite("commercial dates against disposable Postgres", () => {
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      throw new Error("COTIZA_TEST_DATABASE_URL must point to a disposable local database");
    }
    process.env.DATABASE_URL = testUrl;
    db = (await import("./prisma")).prisma;
    proposals = await import("./proposals");
    opportunities = await import("./opportunities");
    kpis = await import("./proposal-kpis");
    await db.tenant.create({ data: { tenant_id: "lifecycle-a", name: "Lifecycle A", slug: "lifecycle-a", created_at: new Date() } });
    await db.tenant.create({ data: { tenant_id: "lifecycle-b", name: "Lifecycle B", slug: "lifecycle-b", created_at: new Date() } });
    await db.app_users.create({ data: { user_id: actor.userId, alias: "lifecycle-seller", first_name: "Test", last_name: "Seller",
      password_hash: "unused", role: "owner", tenant_id: "lifecycle-a", created_at: new Date() } });
    await db.opportunities.create({ data: { opportunity_id: "lifecycle-opp", opportunity_number: "OPP-TEST", title: "Lifecycle test",
      tenant_id: "lifecycle-a", owner_user_id: actor.userId, created_at: new Date("2026-01-01T12:00:00Z") } });
    await db.proposals.create({ data: { proposal_id: "lifecycle-proposal", tenant_id: "lifecycle-a", status: "sent",
      created_by: actor.userId, created_by_user_id: actor.userId, created_at: new Date("2026-02-01T12:00:00Z"), opportunity_id: "lifecycle-opp" } });
    await db.proposal_items.create({ data: { item_id: "lifecycle-item", proposal_id: "lifecycle-proposal", tenant_id: "lifecycle-a",
      item_number: 1, quantity: 1, cost_unit: 60, price_unit: 100, subtotal_cost: 60, subtotal_price: 100, status: "active", created_at: new Date() } });
    // Initialize the pre-existing lazy approval/policy tables outside the
    // decision transaction, as opening the proposal normally does.
    await proposals.getProposalWorkflowByTenant("lifecycle-a", "lifecycle-proposal");
  }, 30_000);

  afterAll(async () => { if (db) await db.$disconnect(); });

  it("records the decision separately from creation and internal approval; retry is idempotent", async () => {
    const before = new Date();
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", "lifecycle-proposal", "won", actor, true)).toBe("updated");
    const row = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "lifecycle-proposal" } });
    expect(row.created_at.toISOString()).toBe("2026-02-01T12:00:00.000Z");
    expect(row.outcome_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(row.status).toBe("approved");
    await proposals.setProposalOutcomeByTenant("lifecycle-a", "lifecycle-proposal", "won", actor, true);
    const retry = await db.proposals.findUniqueOrThrow({ where: { proposal_id: row.proposal_id } });
    expect(retry.outcome_at).toEqual(row.outcome_at);
    expect(await db.proposal_audit_events.count({ where: { proposal_id: row.proposal_id, event_type: "outcome_changed" } })).toBe(1);
    const pipeline = await opportunities.getOpportunityPipelineByTenant("lifecycle-a");
    expect(pipeline[0]).toMatchObject({ stage: "won", createdAt: "2026-01-01T12:00:00.000Z", closedAt: row.outcome_at!.toISOString() });
    expect(pipeline[0].lifetimeDays).toBeGreaterThan(0);
  });

  it("rejects a foreign tenant and another seller without changing the date", async () => {
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-b", "lifecycle-proposal", "lost", actor, true)).toBe("not_found");
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", "lifecycle-proposal", "lost", { ...actor, userId: "someone-else" }, false)).toBe("forbidden");
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: "lifecycle-proposal" } })).outcome).toBe("won");
  });

  it("keeps corrections in audit, and reopening clears the close without resetting the opportunity start", async () => {
    await proposals.setProposalOutcomeByTenant("lifecycle-a", "lifecycle-proposal", "lost", actor, true);
    expect((await opportunities.getOpportunityPipelineByTenant("lifecycle-a"))[0].stage).toBe("lost");
    await proposals.updateProposalWorkflowByTenant("lifecycle-a", "lifecycle-proposal", { status: "draft" }, actor);
    const row = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "lifecycle-proposal" } });
    expect(row.outcome).toBeNull();
    expect(row.outcome_at).toBeNull();
    expect((await opportunities.getOpportunityPipelineByTenant("lifecycle-a"))[0]).toMatchObject({ stage: "open", closedAt: null, createdAt: "2026-01-01T12:00:00.000Z" });
    const audit = await db.proposal_audit_events.findMany({ where: { proposal_id: row.proposal_id, event_type: "outcome_changed" }, orderBy: { created_at: "asc" } });
    expect(audit.map((e) => JSON.parse(e.payload!).toOutcome)).toEqual(["won", "lost", null]);
    expect(JSON.parse(audit[2].payload!).actorUserId).toBe(actor.userId);
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", row.proposal_id, "won", actor, true)).toBe("invalid_status");
  });

  it("does not backfill historical decisions, including when the same outcome is repeated", async () => {
    await db.proposals.update({ where: { proposal_id: "lifecycle-proposal" }, data: { status: "approved", outcome: "won", outcome_at: null } });
    await proposals.setProposalOutcomeByTenant("lifecycle-a", "lifecycle-proposal", "won", actor, true);
    const opp = (await opportunities.getOpportunityPipelineByTenant("lifecycle-a"))[0];
    expect(opp).toMatchObject({ stage: "won", closedAt: null, lifetimeDays: null });
    const summary = await kpis.getProposalKpiSummaryByTenant("lifecycle-a");
    expect(summary).toMatchObject({ wonAmount: 100, undatedOutcomeCount: 1, undatedWonCount: 1,
      undatedLostCount: 0, undatedWonAmount: 100, undatedWonProfit: 40, undatedLostAmount: 0 });
    expect((await kpis.getProposalMarginTimelineByTenant("lifecycle-a", null, true, 240)).every((p) => p.wonAmount === 0)).toBe(true);
  });

  it("attributes old proposals to the CDMX closing month, using only active items and authorized tenant/seller", async () => {
    await db.proposals.update({ where: { proposal_id: "lifecycle-proposal" }, data: { outcome_at: new Date("2026-10-01T02:00:00Z") } });
    await db.proposal_items.create({ data: { item_id: "lifecycle-deleted", proposal_id: "lifecycle-proposal", tenant_id: "lifecycle-a",
      item_number: 2, quantity: 1, cost_unit: 1, price_unit: 9999, subtotal_cost: 1, subtotal_price: 9999, status: "deleted", created_at: new Date() } });
    const timeline = await kpis.getProposalMarginTimelineByTenant("lifecycle-a", actor.userId, false, 240);
    expect(timeline.find((p) => p.period.startsWith("2026-09"))).toMatchObject({ wonAmount: 100, wonProfit: 40, proposedAmount: 0 });
    expect(timeline.find((p) => p.period.startsWith("2026-02"))).toMatchObject({ wonAmount: 0, proposedAmount: 100 });
    expect((await kpis.getProposalMarginTimelineByTenant("lifecycle-b", null, true, 240))).toEqual([]);
    expect((await kpis.getProposalMarginTimelineByTenant("lifecycle-a", "another-seller", false, 240))).toEqual([]);
    const decisions = await kpis.getProposalOutcomeTimelineByTenant("lifecycle-a", null, true, 240);
    expect(decisions.find((p) => p.period.startsWith("2026-09"))).toMatchObject({ wonCount: 1, wonAmount: 100, lostCount: 0 });
    expect(decisions.find((p) => p.period.startsWith("2026-02"))).toMatchObject({ wonCount: 0, lostCount: 0 });
  });

  it("keeps one opportunity clock across proposals and treats an undated winning version conservatively", async () => {
    await db.proposals.create({ data: { proposal_id: "lifecycle-another-proposal", tenant_id: "lifecycle-a", status: "approved",
      created_by: actor.userId, created_by_user_id: actor.userId, created_at: new Date("2026-08-01T12:00:00Z"),
      opportunity_id: "lifecycle-opp", outcome: "won", outcome_at: new Date("2026-10-05T12:00:00Z") } });
    expect((await opportunities.getOpportunityPipelineByTenant("lifecycle-a"))[0]).toMatchObject({
      createdAt: "2026-01-01T12:00:00.000Z", closedAt: "2026-10-01T02:00:00.000Z", stage: "won",
    });
    await db.proposals.update({ where: { proposal_id: "lifecycle-another-proposal" }, data: { outcome_at: null } });
    expect((await opportunities.getOpportunityPipelineByTenant("lifecycle-a"))[0]).toMatchObject({ closedAt: null, lifetimeDays: null, stage: "won" });
    await proposals.setProposalOutcomeByTenant("lifecycle-a", "lifecycle-another-proposal", "discarded", actor, true);
    expect((await opportunities.getOpportunityPipelineByTenant("lifecycle-a"))[0].closedAt).toBe("2026-10-01T02:00:00.000Z");
  });

  it("reconciles undated amounts across items, ignores discarded/deleted data and preserves tenant/seller scope", async () => {
    await db.proposals.createMany({ data: [
      { proposal_id: "historic-won", tenant_id: "lifecycle-a", created_by: actor.userId, created_by_user_id: actor.userId, created_at: new Date("2026-01-01"), status: "approved", outcome: "won" },
      { proposal_id: "historic-lost", tenant_id: "lifecycle-a", created_by: actor.userId, created_by_user_id: actor.userId, created_at: new Date("2026-01-01"), status: "approved", outcome: "lost" },
    ] });
    await db.proposal_items.createMany({ data: [
      { item_id: "hw-1", proposal_id: "historic-won", tenant_id: "lifecycle-a", item_number: 1, subtotal_price: 100, subtotal_cost: 60, status: "active", created_at: new Date() },
      { item_id: "hw-2", proposal_id: "historic-won", tenant_id: "lifecycle-a", item_number: 2, subtotal_price: 200, subtotal_cost: 120, status: "active", created_at: new Date() },
      { item_id: "hw-deleted", proposal_id: "historic-won", tenant_id: "lifecycle-a", item_number: 3, subtotal_price: 9999, subtotal_cost: 1, status: "deleted", created_at: new Date() },
      { item_id: "hl-1", proposal_id: "historic-lost", tenant_id: "lifecycle-a", item_number: 1, subtotal_price: 75, subtotal_cost: 50, status: "active", created_at: new Date() },
    ].map((item) => ({ ...item, quantity: 1, cost_unit: item.subtotal_cost, price_unit: item.subtotal_price })) });
    const summary = await kpis.getProposalKpiSummaryByTenant("lifecycle-a", actor.userId, false);
    expect(summary).toMatchObject({ wonAmount: 400, undatedWonCount: 1, undatedLostCount: 1,
      undatedOutcomeCount: 2, undatedWonAmount: 300, undatedWonProfit: 120, undatedLostAmount: 75 });
    expect((await kpis.getProposalKpiSummaryByTenant("lifecycle-b"))).toMatchObject({ undatedOutcomeCount: 0, undatedWonAmount: 0 });
    expect((await kpis.getProposalKpiSummaryByTenant("lifecycle-a", "other", false))).toMatchObject({ undatedOutcomeCount: 0, undatedWonAmount: 0 });
    expect((await kpis.getProposalMarginTimelineByTenant("lifecycle-a", null, true, 240)).reduce((sum, p) => sum + p.wonAmount, 0)).toBe(100);
    expect((await kpis.getProposalOutcomeTimelineByTenant("lifecycle-a", null, true, 240)).reduce((sum, p) => sum + p.lostAmount, 0)).toBe(0);
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: "historic-won" } })).outcome_at).toBeNull();
  });
});
