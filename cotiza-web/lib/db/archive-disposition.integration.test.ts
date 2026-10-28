import { randomUUID } from "crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const suite = process.env.COTIZA_DISPOSITION_INTEGRATION === "1" ? describe : describe.skip;
suite("archive and opportunity disposition against disposable local Postgres", () => {
  let db: typeof import("./prisma").prisma;
  let archive: typeof import("./quote-archive").setQuoteArchived;
  let set: typeof import("./opportunity-disposition").setOpportunityDisposition;
  let pipeline: typeof import("./opportunities").getOpportunityPipelineByTenant;
  const tenantId = `disposition-${randomUUID()}`, clientId = randomUUID(), viewer = { userId: "fixture-seller", canSeeAll: false };
  beforeAll(async () => {
    if (!["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error("Disposable local DB only");
    ({ prisma: db } = await import("./prisma")); ({ setQuoteArchived: archive } = await import("./quote-archive"));
    ({ setOpportunityDisposition: set } = await import("./opportunity-disposition"));
    ({ getOpportunityPipelineByTenant: pipeline } = await import("./opportunities"));
    await db.tenant.create({ data: { tenant_id: tenantId, slug: tenantId, name: "Disposition fixture", created_at: new Date() } });
    await db.client.create({ data: { client_id: clientId, tenant_id: tenantId, company: "Synthetic account", created_at: new Date() } });
  });
  afterAll(async () => { await db?.$disconnect(); });
  async function fixture() {
    const id = randomUUID(), quoteId = randomUUID();
    await db.opportunities.create({ data: { opportunity_id: id, opportunity_number: id, tenant_id: tenantId, client_id: clientId, owner_user_id: viewer.userId,
      title: "Synthetic opportunity", intake_metadata: { version: 1, kind: "quote-origin", need: "Preserve this" }, created_at: new Date("2026-01-01") } });
    await db.quote.create({ data: { quote_id: quoteId, quote_group_id: quoteId, tenantId, opportunity_id: id, client_id: clientId, created_by_user_id: viewer.userId,
      status: "draft", version: 1, total_revenue: 100, createdAt: new Date(), input_metadata: { importSource: "preserve" } } });
    await db.quote_lines.create({ data: { line_id: randomUUID(), quote_id: quoteId, quantity: 1, cost_unit: 60, final_price_unit: 100 } });
    return { id, quoteId };
  }
  it("archives and restores exact draft preserving lines, metadata, opportunity and history; blocks writes while archived", async () => {
    const { id, quoteId } = await fixture();
    expect(await archive(tenantId, quoteId, viewer.userId, false, true, "No usar esta versión")).toEqual({ status: "archived" });
    const row = await db.quote.findUniqueOrThrow({ where: { quote_id: quoteId } });
    expect(row.version).toBe(1); expect(row.total_revenue!.toNumber()).toBe(100);
    expect(row.input_metadata).toMatchObject({ importSource: "preserve", archiveHistory: [{ action: "archive", by: viewer.userId }] });
    expect(await db.quote_lines.count({ where: { quote_id: quoteId } })).toBe(1);
    expect((await pipeline(tenantId)).find(o => o.opportunityId === id)!.stage).toBe("open");
    const { updateQuoteLinesByTenant } = await import("./quote-editor");
    await expect(updateQuoteLinesByTenant(tenantId, quoteId, [])).rejects.toThrow("Reactiva");
    const { createDraftFromQuoteInput } = await import("./quote-input");
    await expect(createDraftFromQuoteInput({ tenantId, quoteId, operationId: randomUUID(), mode: "replace", source: { kind: "excel" },
      lines: [{ sku: "X", description: "Changed", quantity: 1, costUnit: 50, priceUnit: 100, lineType: "product", serviceOrigin: "" }] })).rejects.toThrow("Reactiva");
    expect(await archive(tenantId, quoteId, viewer.userId, false, false)).toEqual({ status: "draft" });
    expect((await db.quote.findUniqueOrThrow({ where: { quote_id: quoteId } })).input_metadata).toMatchObject({ archiveHistory: [{ action: "archive" }, { action: "restore" }] });
  });
  it("rejects foreign scopes, other sellers, non-drafts and quotes with proposals", async () => {
    const { id, quoteId } = await fixture();
    expect(await archive("foreign", quoteId, viewer.userId, true, true, "Archive")).toBeNull();
    expect(await archive(tenantId, quoteId, "other", false, true, "Archive")).toBeNull();
    await db.proposals.create({ data: { proposal_id: randomUUID(), tenant_id: tenantId, origin: quoteId, opportunity_id: id, status: "draft", created_at: new Date(), created_by: "Fixture" } });
    expect(await archive(tenantId, quoteId, viewer.userId, false, true, "Archive")).toBeNull();
    await db.quote.update({ where: { quote_id: quoteId }, data: { status: "closed" } });
    expect(await archive(tenantId, quoteId, viewer.userId, false, true, "Archive")).toBeNull();
  });
  it("pauses with one reminder, rejects a stale retry, closes without loss and reactivates preserving intake and history", async () => {
    const { id } = await fixture();
    const paused = { state: "paused" as const, reason: "El cliente pospuso el proyecto", resumeOn: "2099-01-01", revision: 0 };
    expect(await set(tenantId, id, viewer, paused)).toBe("updated");
    expect(await set(tenantId, id, viewer, paused)).toBe("conflict");
    expect((await pipeline(tenantId)).find(o => o.opportunityId === id)).toMatchObject({ stage: "paused", closedAt: null, disposition: { resumeOn: "2099-01-01", revision: 1 } });
    expect(await db.tasks.count({ where: { tenant_id: tenantId, opportunity_id: id, completed_at: null } })).toBe(1);
    expect(await set(tenantId, id, viewer, { state: "no_decision", reason: "No se autorizó el proyecto", revision: 1 })).toBe("updated");
    expect((await pipeline(tenantId)).find(o => o.opportunityId === id)).toMatchObject({ stage: "no_decision" });
    expect(await db.tasks.count({ where: { tenant_id: tenantId, opportunity_id: id, completed_at: null } })).toBe(0);
    expect(await set(tenantId, id, viewer, { state: "open", reason: "El cliente retomó el proyecto", revision: 2 })).toBe("updated");
    const row = await db.opportunities.findUniqueOrThrow({ where: { opportunity_id: id } });
    expect(row.created_at.toISOString()).toBe("2026-01-01T00:00:00.000Z"); expect(row.closed_at).toBeNull();
    expect(row.intake_metadata).toMatchObject({ need: "Preserve this", commercialDisposition: { state: "open", revision: 3 } });
    expect((row.intake_metadata as { commercialDispositionHistory: unknown[] }).commercialDispositionHistory).toHaveLength(3);
    expect(await db.proposals.count({ where: { tenant_id: tenantId, opportunity_id: id, outcome: "lost" } })).toBe(0);
  });
  it("protects actual proposal decisions, scope and optimistic revision", async () => {
    const { id } = await fixture(); const input = { state: "no_decision" as const, reason: "No avanzó", revision: 0 };
    expect(await set("foreign", id, { ...viewer, canSeeAll: true }, input)).toBe("not_found");
    expect(await set(tenantId, id, { ...viewer, userId: "other" }, input)).toBe("not_found");
    await db.proposals.create({ data: { proposal_id: randomUUID(), tenant_id: tenantId, opportunity_id: id, status: "approved", outcome: "won", outcome_at: new Date(), created_at: new Date(), created_by: "Fixture" } });
    expect(await set(tenantId, id, viewer, input)).toBe("decided");
    expect((await pipeline(tenantId)).find(o => o.opportunityId === id)!.stage).toBe("won");
  });
});
