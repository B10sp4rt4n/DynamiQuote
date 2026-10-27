import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const suite = process.env.COTIZA_INTAKE_INTEGRATION === "1" ? describe : describe.skip;
suite("quote-origin opportunity intake on a disposable local database", () => {
  let db: typeof import("./prisma").prisma;
  let quotes: typeof import("./quotes");
  let intake: typeof import("./opportunity-intake");
  let opportunities: typeof import("./opportunities");
  let writer: typeof import("./quote-input");
  const tenantId = `intake-${randomUUID()}`, otherTenant = `other-${randomUUID()}`, clientId = randomUUID();
  const viewer = { userId: "intake-seller", canSeeAll: false };
  const input = { clientName: "Synthetic company", opportunityMode: "new" as const, creationId: randomUUID() };
  let quoteId: string, opportunityId: string;
  beforeAll(async () => {
    if (!["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error("Local disposable DB required");
    ({ prisma: db } = await import("./prisma")); quotes = await import("./quotes"); intake = await import("./opportunity-intake");
    opportunities = await import("./opportunities"); writer = await import("./quote-input");
    for (const id of [tenantId, otherTenant]) await db.tenant.create({ data: { tenant_id: id, name: id, slug: id, created_at: new Date() } });
    await db.client.create({ data: { client_id: clientId, tenant_id: tenantId, company: "Synthetic company", active: true, created_at: new Date() } });
  });
  afterAll(async () => { await db?.$disconnect(); });
  it("creates without an initial CRM form, persists the missing fields and retries without duplicating", async () => {
    const first = await quotes.createQuoteForTenant(tenantId, input, viewer.userId);
    const retry = await quotes.createQuoteForTenant(tenantId, input, viewer.userId);
    expect(retry.quoteId).toBe(first.quoteId); quoteId = first.quoteId;
    const row = await db.quote.findUniqueOrThrow({ where: { quote_id: quoteId } }); opportunityId = row.opportunity_id!;
    expect(await db.opportunities.count({ where: { tenant_id: tenantId } })).toBe(1);
    expect(await db.quote_lines.count({ where: { quote_id: quoteId } })).toBe(1);
    expect(await intake.getOpportunityIntake(tenantId, opportunityId, viewer)).toMatchObject({ managed: true, missingFields: ["Nombre de oportunidad", "Necesidad", "Origen"] });
    expect((await opportunities.getOpportunityPipelineByTenant(tenantId, viewer.userId, false))[0]).toMatchObject({ intakePending: true, intakeQuoteId: quoteId, stage: "open" });
    await expect(quotes.createQuoteForTenant(tenantId, { ...input, proposalName: "Changed" }, viewer.userId)).rejects.toMatchObject({ status: 409 });
  });
  it("saves partial data, requires a current revision and removes the reminder only on completion", async () => {
    expect(await intake.saveOpportunityIntake(tenantId, opportunityId, viewer, { title: "Renewal", need: "", source: "", nextStep: "Call", revision: 0 })).toBe("updated");
    expect(await intake.saveOpportunityIntake(tenantId, opportunityId, viewer, { title: "Stale", need: "Other", source: "Other", nextStep: "", revision: 0 })).toBe("conflict");
    expect(await intake.getOpportunityIntake(tenantId, opportunityId, viewer)).toMatchObject({ title: "Renewal", revision: 1, missingFields: ["Necesidad", "Origen"] });
    expect(await intake.saveOpportunityIntake(tenantId, opportunityId, viewer, { title: "Renewal", need: "Protect mail", source: "Customer request", nextStep: "", revision: 1 })).toBe("updated");
    expect(await intake.getOpportunityIntake(tenantId, opportunityId, viewer)).toMatchObject({ missingFields: [], revision: 2 });
    expect((await opportunities.getOpportunityPipelineByTenant(tenantId))[0]).toMatchObject({ intakePending: false, stage: "open" });
    expect(await db.tasks.count({ where: { tenant_id: tenantId } })).toBe(0);
  });
  it("rejects foreign tenants and other sellers on reads and writes, without changing data", async () => {
    const fields = { title: "Intrusion", need: "x", source: "x", nextStep: "", revision: 2 };
    expect(await intake.getOpportunityIntake(otherTenant, opportunityId, { ...viewer, canSeeAll: true })).toBeNull();
    expect(await intake.getOpportunityIntake(tenantId, opportunityId, { ...viewer, userId: "other-seller" })).toBeNull();
    expect(await intake.saveOpportunityIntake(otherTenant, opportunityId, { ...viewer, canSeeAll: true }, fields)).toBe("not_found");
    expect(await intake.saveOpportunityIntake(tenantId, opportunityId, { ...viewer, userId: "other-seller" }, fields)).toBe("not_found");
    expect(await intake.getOpportunityIntake(tenantId, opportunityId, viewer)).toMatchObject({ title: "Renewal", revision: 2 });
  });
  it("still fills the first import into v1, then inherits the opportunity and reminder across revisions", async () => {
    const data = { tenantId, quoteId, mode: "replace" as const, source: { kind: "excel" as const },
      lines: [{ sku: "X", description: "Synthetic line", quantity: 1, costUnit: 80, priceUnit: 100, lineType: "product" as const, serviceOrigin: "" }] };
    const first = await writer.createDraftFromQuoteInput({ ...data, operationId: randomUUID() });
    expect(first!.quote).toMatchObject({ version: 1, quoteId });
    const second = await writer.createDraftFromQuoteInput({ ...data, operationId: randomUUID() });
    expect(second!.quote.version).toBe(2);
    expect((await db.quote.findUniqueOrThrow({ where: { quote_id: second!.quote.quoteId } })).opportunity_id).toBe(opportunityId);
    expect(await db.opportunities.count({ where: { tenant_id: tenantId } })).toBe(1);
  });
  it("attaches another quote to an existing opportunity without creating or resetting its intake", async () => {
    const base = await quotes.createQuoteForTenant(tenantId, { ...input, creationId: randomUUID(), clientId, proposalName: "Catalog renewal" }, viewer.userId);
    const original = await db.quote.findUniqueOrThrow({ where: { quote_id: base.quoteId } });
    const before = await intake.getOpportunityIntake(tenantId, original.opportunity_id!, viewer);
    const linked = await quotes.createQuoteForTenant(tenantId, { clientName: "Synthetic company", clientId, creationId: randomUUID(), opportunityMode: "existing", opportunityId: original.opportunity_id! }, viewer.userId);
    expect((await db.quote.findUniqueOrThrow({ where: { quote_id: linked.quoteId } })).opportunity_id).toBe(original.opportunity_id);
    expect(await intake.getOpportunityIntake(tenantId, original.opportunity_id!, viewer)).toEqual(before);
    expect(await db.opportunities.count({ where: { tenant_id: tenantId } })).toBe(2);
    await expect(quotes.createQuoteForTenant(tenantId, { ...input, creationId: linked.quoteId, clientId }, viewer.userId)).rejects.toMatchObject({ status: 409 });
    for (const args of [{ tenant: otherTenant, client: clientId, actor: viewer.userId }, { tenant: tenantId, client: clientId, actor: "other-seller" }]) {
      await expect(quotes.createQuoteForTenant(args.tenant, { clientName: "Synthetic company", clientId: args.client, opportunityMode: "existing", opportunityId: original.opportunity_id! }, args.actor)).rejects.toMatchObject({ status: 404 });
    }
    await expect(quotes.createQuoteForTenant(otherTenant, { ...input, creationId: randomUUID(), clientId }, viewer.userId)).rejects.toMatchObject({ status: 404 });
  });
  it("does not mark legacy opportunities pending, including legacy quote callers", async () => {
    const old = await quotes.createQuoteForTenant(tenantId, { clientName: "Legacy synthetic", proposalName: "Old flow" }, viewer.userId);
    const row = await db.quote.findUniqueOrThrow({ where: { quote_id: old.quoteId } });
    expect(row.input_metadata).toBeNull();
    expect(await intake.getOpportunityIntake(tenantId, row.opportunity_id!, viewer)).toMatchObject({ managed: false, missingFields: [] });
    expect((await opportunities.getOpportunityPipelineByTenant(tenantId)).find(row => row.title === "Old flow")?.intakePending).toBeUndefined();
  });
  it("does not attach a quote to a lost or fully discarded opportunity", async () => {
    const base = await quotes.createQuoteForTenant(tenantId, { ...input, creationId: randomUUID(), clientId }, viewer.userId);
    const row = await db.quote.findUniqueOrThrow({ where: { quote_id: base.quoteId } });
    const proposalId = randomUUID();
    await db.proposals.create({ data: { proposal_id: proposalId, tenant_id: tenantId, opportunity_id: row.opportunity_id, status: "approved", outcome: "lost", created_at: new Date(), created_by: viewer.userId } });
    const request = { clientName: "Synthetic company", clientId, opportunityMode: "existing" as const, opportunityId: row.opportunity_id! };
    await expect(quotes.createQuoteForTenant(tenantId, request, viewer.userId)).rejects.toMatchObject({ status: 404 });
    await db.proposals.update({ where: { proposal_id: proposalId }, data: { outcome: "discarded" } });
    await expect(quotes.createQuoteForTenant(tenantId, request, viewer.userId)).rejects.toMatchObject({ status: 404 });
  });
});
