import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { COMMERCIAL_HASH_PREFIX, commercialPayloadHash, verifyCommercialPayload } from "@/lib/domain/commercial-act";

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
    await db.proposals.create({ data: { proposal_id: "lifecycle-proposal", tenant_id: "lifecycle-a", status: "approved",
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
  it("tags only existing undated decisions once, restores creation months and prioritizes real closes after reopening", async () => {
    const migration = readFileSync("prisma/manual/20261021_legacy_outcome_creation_reference.sql", "utf8");
    // The migration has one INSERT; its reason contains a semicolon, so use
    // the full SQL body as one statement, preserving quoted text.
    const insert = migration.slice(migration.indexOf("INSERT INTO"), migration.lastIndexOf("COMMIT;")).trim().replace(/;$/, "");
    await db.$executeRawUnsafe(insert);
    await db.$executeRawUnsafe(insert);
    expect(await db.proposal_audit_events.count({ where: { event_type: "historical_creation_reference" } })).toBe(2);
    const summary = await kpis.getProposalKpiSummaryByTenant("lifecycle-a", actor.userId, false);
    expect(summary).toMatchObject({ legacyCreationOutcomeCount: 2, legacyCreationWonAmount: 300,
      undatedOutcomeCount: 0, undatedWonAmount: 0, wonAmount: 400 });
    const timeline = await kpis.getProposalMarginTimelineByTenant("lifecycle-a", null, true, 240);
    expect(timeline.find(p => p.period.startsWith("2025-12"))).toMatchObject({ wonAmount: 300, wonProfit: 120 });
    expect(timeline.find(p => p.period.startsWith("2026-09"))).toMatchObject({ wonAmount: 100, wonProfit: 40 });
    const outcomes = await kpis.getProposalOutcomeTimelineByTenant("lifecycle-a", null, true, 240);
    expect(outcomes.find(p => p.period.startsWith("2025-12"))).toMatchObject({ wonCount: 1, lostCount: 1, wonAmount: 300, lostAmount: 75 });
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: "historic-won" } })).outcome_at).toBeNull();
    expect((await kpis.getProposalKpiSummaryByTenant("lifecycle-b"))).toMatchObject({ legacyCreationOutcomeCount: 0 });
    expect((await kpis.getProposalKpiSummaryByTenant("lifecycle-a", "other", false))).toMatchObject({ legacyCreationOutcomeCount: 0 });
    await proposals.updateProposalWorkflowByTenant("lifecycle-a", "historic-won", { status: "draft" }, actor);
    // Reusing a historical proposal still requires a new, observed decision.
    expect((await kpis.getProposalKpiSummaryByTenant("lifecycle-a"))).toMatchObject({ legacyCreationOutcomeCount: 1, legacyCreationWonAmount: 0 });
    await db.proposals.update({ where: { proposal_id: "historic-won" }, data: { status: "approved" } });
    await proposals.setProposalOutcomeByTenant("lifecycle-a", "historic-won", "won", actor, true);
    const closed = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "historic-won" } });
    expect(closed.created_at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(closed.outcome_at).not.toBeNull();
    expect((await kpis.getProposalKpiSummaryByTenant("lifecycle-a"))).toMatchObject({ legacyCreationOutcomeCount: 1, legacyCreationWonAmount: 0 });
    const refreshed = await kpis.getProposalMarginTimelineByTenant("lifecycle-a", null, true, 240);
    expect(refreshed.find(p => p.period.startsWith("2025-12"))).toBeUndefined();
    expect(refreshed.reduce((sum, p) => sum + p.wonAmount, 0)).toBe(400);
    expect(await db.proposal_audit_events.count({ where: { proposal_id: "historic-won", event_type: "historical_creation_reference" } })).toBe(1);
  });

  it("moves a historical win to a chosen close month, preserving totals, audit and creation", async () => {
    await db.opportunities.create({ data: { opportunity_id: "calendar-opp", opportunity_number: "OPP-CALENDAR", title: "Calendar test",
      tenant_id: "lifecycle-a", owner_user_id: actor.userId, created_at: new Date("2026-07-01T23:00:00Z") } });
    await db.proposals.create({ data: { proposal_id: "calendar-proposal", tenant_id: "lifecycle-a", status: "approved", outcome: "won",
      created_by: actor.userId, created_by_user_id: actor.userId, created_at: new Date("2026-07-22T12:00:00Z"), opportunity_id: "calendar-opp" } });
    await db.proposal_items.create({ data: { item_id: "calendar-item", proposal_id: "calendar-proposal", tenant_id: "lifecycle-a",
      item_number: 1, quantity: 1, cost_unit: 60, price_unit: 100, subtotal_cost: 60, subtotal_price: 100, status: "active", created_at: new Date() } });
    await db.proposal_audit_events.create({ data: { event_id: "legacy-creation-20261021:calendar-proposal", event_hash: "calendar-hash",
      event_type: "historical_creation_reference", tenant_id: "lifecycle-a", proposal_id: "calendar-proposal", created_at: new Date(), payload: "{}" } });
    const before = await kpis.getProposalMarginTimelineByTenant("lifecycle-a", null, true, 240);
    const total = before.reduce((sum, row) => sum + row.wonAmount, 0);
    const monthAmount = (rows: typeof before, month: string) => rows.find(row => row.period.startsWith(month))?.wonAmount ?? 0;
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", "calendar-proposal", "won", actor, true,
      { closedOn: "2026-09-01", expectedOutcome: "won", expectedOutcomeAt: null })).toBe("updated");
    const row = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "calendar-proposal" } });
    expect(row.outcome_at!.toISOString()).toBe("2026-09-01T06:00:00.000Z");
    expect(row.created_at.toISOString()).toBe("2026-07-22T12:00:00.000Z");
    expect(row.outcome).toBe("won");
    const after = await kpis.getProposalMarginTimelineByTenant("lifecycle-a", null, true, 240);
    expect(after.reduce((sum, point) => sum + point.wonAmount, 0)).toBe(total);
    expect(monthAmount(after, "2026-07")).toBe(monthAmount(before, "2026-07") - 100);
    expect(monthAmount(after, "2026-09")).toBe(monthAmount(before, "2026-09") + 100);
    const audit = await db.proposal_audit_events.findFirstOrThrow({ where: { proposal_id: row.proposal_id, event_type: "outcome_date_changed" } });
    expect(JSON.parse(audit.payload!)).toMatchObject({ actorUserId: actor.userId, previousOutcomeAt: null,
      outcomeAt: "2026-09-01T06:00:00.000Z", selectedCloseDate: "2026-09-01", datePrecision: "day" });
    expect(audit.created_at.getTime()).toBeGreaterThan(row.outcome_at!.getTime());
    expect(await db.proposal_audit_events.count({ where: { proposal_id: row.proposal_id, event_type: "historical_creation_reference" } })).toBe(1);
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", row.proposal_id, "won", actor, true,
      { closedOn: "2026-09-01", expectedOutcome: "won", expectedOutcomeAt: row.outcome_at!.toISOString() })).toBe("updated");
    expect(await db.proposal_audit_events.count({ where: { proposal_id: row.proposal_id, event_type: "outcome_date_changed" } })).toBe(1);
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", row.proposal_id, "won", actor, true,
      { closedOn: "2026-08-01", expectedOutcome: "won", expectedOutcomeAt: null })).toBe("conflict");
  });

  it("validates dates and tenant/seller access, and allows closure after opportunity start but before the document was created", async () => {
    for (const closedOn of ["2999-01-01", "2026-06-30", "2026-02-30"]) {
      expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", "calendar-proposal", "won", actor, true, { closedOn })).toBe("invalid_date");
    }
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-b", "calendar-proposal", "won", actor, true, { closedOn: "2026-08-01" })).toBe("not_found");
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", "calendar-proposal", "won", { ...actor, userId: "other" }, false, { closedOn: "2026-08-01" })).toBe("forbidden");
    expect(await proposals.setProposalOutcomeByTenant("lifecycle-a", "calendar-proposal", "lost", actor, true, { closedOn: "2026-07-03" })).toBe("updated");
    const pipeline = await opportunities.getOpportunityPipelineByTenant("lifecycle-a");
    expect(pipeline.find(row => row.opportunityId === "calendar-opp")).toMatchObject({ stage: "lost", lifetimeDays: 2, closedAt: "2026-07-03T06:00:00.000Z" });
    await proposals.updateProposalWorkflowByTenant("lifecycle-a", "calendar-proposal", { status: "draft" }, actor);
    const row = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "calendar-proposal" } });
    expect(row.outcome_at).toBeNull();
    expect(row.outcome).toBeNull();
    expect((await opportunities.getOpportunityPipelineByTenant("lifecycle-a")).find(row => row.opportunityId === "calendar-opp")?.createdAt).toBe("2026-07-01T23:00:00.000Z");
  });

  it("records a linked, hash-verifiable contract for decisions, date corrections and reopening", async () => {
    const rows = await db.proposal_audit_events.findMany({ where: { proposal_id: "calendar-proposal",
      event_type: { in: ["outcome_changed", "outcome_date_changed"] } } });
    const acts = rows.map(row => ({ row, payload: JSON.parse(row.payload!) }))
      .sort((left, right) => left.payload.commercialAct.sequence - right.payload.commercialAct.sequence);
    expect(acts).toHaveLength(3);
    expect(acts.map(({ row, payload }) => verifyCommercialPayload(payload, row.event_hash)))
      .toEqual(["hash_verified", "hash_verified", "hash_verified"]);
    const [correction, decision, reopening] = acts;
    expect(correction.payload.commercialAct).toMatchObject({ tenant_id: "lifecycle-a", opportunity_id: "calendar-opp",
      commercial_effective_time: { selected_date: "2026-09-01", basis: "user_declared", precision: "day" },
      state_before: { outcome: "won", outcomeAt: null },
      memory: { status: "local_only", external_recordia_ref: null, custody_status: "not_requested" },
    });
    expect(correction.payload.commercialAct.recorded_at_utc).toBe(correction.row.created_at.toISOString());
    expect(decision.payload.commercialAct).toMatchObject({ sequence: 2,
      previous_content_hash_sha256: correction.row.event_hash.slice(COMMERCIAL_HASH_PREFIX.length),
      relations: [{ predicate: "supersedes", target_id: correction.row.event_id }] });
    expect(reopening.payload.commercialAct).toMatchObject({ sequence: 3,
      state_before: { status: "approved", outcome: "lost" }, state_after: { status: "draft", outcome: null, outcomeAt: null },
      relations: [{ predicate: "revokes", target_id: decision.row.event_id }] });
    const { getProposalAuditTimelineByTenant } = await import("./proposal-audit");
    const timeline = await getProposalAuditTimelineByTenant("lifecycle-a", "calendar-proposal");
    expect(timeline.filter(event => event.integrity === "hash_verified")).toHaveLength(3);
    expect(await getProposalAuditTimelineByTenant("lifecycle-b", "calendar-proposal")).toEqual([]);
  });

  it("rolls back a decision when audit persistence fails, preserving the prior state", async () => {
    await db.proposals.create({ data: { proposal_id: "memory-reopen", tenant_id: "lifecycle-a", status: "approved",
      outcome: "won", outcome_at: new Date("2026-08-01T06:00:00Z"), created_at: new Date("2026-02-01"),
      created_by: actor.userId, created_by_user_id: actor.userId } });
    await db.$executeRawUnsafe(`CREATE FUNCTION fail_commercial_act_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.proposal_id IN ('calendar-proposal','memory-reopen') AND NEW.event_type='outcome_changed' THEN
        RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_commercial_act_fixture BEFORE INSERT ON proposal_audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_commercial_act_fixture()`);
    const before = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "calendar-proposal" } });
    const count = await db.proposal_audit_events.count({ where: { proposal_id: before.proposal_id } });
    try {
      await expect(proposals.setProposalOutcomeByTenant("lifecycle-a", before.proposal_id, "discarded", actor, true))
        .rejects.toThrow();
      expect(await db.proposals.findUniqueOrThrow({ where: { proposal_id: before.proposal_id } })).toEqual(before);
      expect(await db.proposal_audit_events.count({ where: { proposal_id: before.proposal_id } })).toBe(count);
      const beforeReopen = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "memory-reopen" } });
      await expect(proposals.updateProposalWorkflowByTenant("lifecycle-a", "memory-reopen", { status: "draft" }, actor))
        .rejects.toThrow();
      expect(await db.proposals.findUniqueOrThrow({ where: { proposal_id: "memory-reopen" } })).toEqual(beforeReopen);
    } finally {
      await db.$executeRawUnsafe("DROP TRIGGER fail_commercial_act_fixture ON proposal_audit_events");
      await db.$executeRawUnsafe("DROP FUNCTION fail_commercial_act_fixture()");
    }
  });

  it("detects modified recorded content and refuses to extend a damaged commercial history", async () => {
    const event = await db.proposal_audit_events.findFirstOrThrow({ where: { proposal_id: "calendar-proposal",
      event_type: "outcome_date_changed" } });
    const original = event.payload!;
    await db.proposal_audit_events.update({ where: { event_id: event.event_id },
      data: { payload: JSON.stringify({ ...JSON.parse(original), toOutcome: "forged" }) } });
    const before = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "calendar-proposal" } });
    try {
      const { getProposalAuditTimelineByTenant } = await import("./proposal-audit");
      expect((await getProposalAuditTimelineByTenant("lifecycle-a", before.proposal_id))
        .find(item => item.id === event.event_id)?.integrity).toBe("hash_mismatch");
      await expect(proposals.setProposalOutcomeByTenant("lifecycle-a", before.proposal_id, "discarded", actor, true))
        .rejects.toThrow("verificación de integridad");
      expect(await db.proposals.findUniqueOrThrow({ where: { proposal_id: before.proposal_id } })).toEqual(before);
    } finally {
      await db.proposal_audit_events.update({ where: { event_id: event.event_id }, data: { payload: original } });
    }
    expect(commercialPayloadHash(JSON.parse(original))).toBe(event.event_hash);
  });

  it("serializes concurrent retries into one decision and one recorded act", async () => {
    await db.proposals.create({ data: { proposal_id: "memory-concurrent", tenant_id: "lifecycle-a", status: "approved",
      created_at: new Date("2026-02-01"), created_by: actor.userId, created_by_user_id: actor.userId } });
    const results = await Promise.all([
      proposals.setProposalOutcomeByTenant("lifecycle-a", "memory-concurrent", "won", actor, true,
        { closedOn: "2026-08-20", expectedOutcome: null }),
      proposals.setProposalOutcomeByTenant("lifecycle-a", "memory-concurrent", "won", actor, true,
        { closedOn: "2026-08-20", expectedOutcome: null }),
    ]);
    expect(results.sort()).toEqual(["conflict", "updated"]);
    expect(await db.proposal_audit_events.count({ where: { proposal_id: "memory-concurrent", event_type: "outcome_changed" } })).toBe(1);
    const row = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "memory-concurrent" } });
    expect(row.outcome).toBe("won");
    expect(row.outcome_at?.toISOString()).toBe("2026-08-20T06:00:00.000Z");
  });
});
