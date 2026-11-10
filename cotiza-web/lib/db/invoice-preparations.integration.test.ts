import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const remote = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ validateSatClassifications: remote.validate }));
const url = process.env.COTIZA_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
let db: typeof import("./prisma").prisma;
let classifications: typeof import("./fiscal-classifications");
let invoices: typeof import("./proposal-invoices");
let preparations: typeof import("./invoice-preparations");
let preparation: import("./invoice-preparations").InvoicePreparation;
let proposalId: string, sequence = 0;
const tenantId = "preparation-synthetic-tenant", actorUserId = "synthetic-reviewer";
const fingerprint = "a".repeat(64), catalogVersion = "b".repeat(64);
const emitter = { rfc: "AAA010101AAA", name: "EMISOR SINTÉTICO", regimen: "601", zip: "01000" };
const scope = () => ({ tenantId, actorUserId, proposalId, draftId: "synthetic-draft", fingerprint, emitter, itemNumbers: [1] });

suite("Prefactura persistence against disposable PostgreSQL; catalog synthetic and no PAC", () => {
  beforeAll(async () => {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url!).hostname)) throw Error("Disposable loopback database required");
    process.env.DATABASE_URL = url;
    ({ prisma: db } = await import("./prisma"));
    classifications = await import("./fiscal-classifications");
    invoices = await import("./proposal-invoices");
    preparations = await import("./invoice-preparations");
  });
  beforeEach(async () => {
    vi.resetAllMocks(); proposalId = `synthetic-preparation-${++sequence}`;
    await db.proposals.create({ data: { proposal_id: proposalId, tenant_id: tenantId, status: "draft", outcome: "won", created_by: actorUserId, created_at: new Date() } });
    const event = await classifications.recordClassification({ tenantId, actorUserId, proposalId, fingerprint,
      item: { itemNumber: 1, sku: "SYNTHETIC-EDR", description: "Licencia sintética 12 meses" }, nature: "license",
      satProductCode: "43233205", unitCode: "E48", catalogVersion, remember: false });
    preparation = { actorUserId, emitter, missingFields: [], input: {
      customerName: "RECEPTOR SINTÉTICO", customerRfc: "BBB010101BBB", customerRegimen: "601", customerUseCfdi: "G03",
      customerZip: "02000", paymentForm: "28", paymentMethod: "PUE", saveToClient: false, itemsFingerprint: fingerprint,
      fiscalItems: [{ itemNumber: 1, satProductCode: "43233205", unitCode: "E48", catalogVersion, classificationEventId: event.id }] } };
    remote.validate.mockResolvedValue({ valid: true, catalog: { sourceSha256: catalogVersion }, items: [{ itemNumber: 1, valid: true,
      product: { code: "43233205", valid: true }, unit: { code: "E48", valid: true } }] });
  });
  afterAll(async () => { if (db) await db.$disconnect(); });

  it("persists the confirmed decision and exact preparation, then reads them through a separate connection", async () => {
    expect(await invoices.saveProposalInvoiceDraftByTenant(tenantId, proposalId, "synthetic-draft", null, preparation)).toBe(true);
    const { Client } = await import("pg"); const reader = new Client({ connectionString: url }); await reader.connect();
    try {
      const persisted = await reader.query("SELECT invoice_draft_id FROM proposals WHERE proposal_id=$1", [proposalId]);
      expect(persisted.rows[0].invoice_draft_id).toBe("synthetic-draft");
      const audit = await reader.query("SELECT payload FROM proposal_audit_events WHERE proposal_id=$1 AND event_type='invoice_preparation_saved'", [proposalId]);
      expect(JSON.parse(audit.rows[0].payload).input).toEqual(preparation.input);
    } finally { await reader.end(); }
    expect(await preparations.recoverInvoicePreparation(scope())).toEqual({ input: preparation.input, missingFields: [] });
    expect(await classifications.savedClassification({ ...scope(), itemNumber: 1 })).toMatchObject({ nature: "license", remember: false,
      classification: preparation.input.fiscalItems[0] });
    expect(await classifications.classificationMemory(tenantId, { itemNumber: 1, sku: "SYNTHETIC-EDR", description: "Licencia sintética 12 meses" }, "license")).toBeNull();
  });

  it("never restores a different tenant, actor, proposal, revision, emitter, draft or item set", async () => {
    await invoices.saveProposalInvoiceDraftByTenant(tenantId, proposalId, "synthetic-draft", null, preparation);
    for (const changed of [{ tenantId: "other" }, { actorUserId: "other" }, { proposalId: "other" },
      { fingerprint: "c".repeat(64) }, { emitter: { ...emitter, zip: "03000" } }, { draftId: "other" }, { itemNumbers: [1, 2] }]) {
      expect(await preparations.recoverInvoicePreparation({ ...scope(), ...changed })).toBeNull();
    }
    for (const changed of [{ tenantId: "other" }, { actorUserId: "other" }, { proposalId: "other" }, { fingerprint: "c".repeat(64) }, { itemNumber: 2 }]) {
      expect(await classifications.savedClassification({ ...scope(), itemNumber: 1, ...changed })).toBeNull();
    }
  });

  it("rejects catalog drift and damaged receipts without modifying the draft", async () => {
    await invoices.saveProposalInvoiceDraftByTenant(tenantId, proposalId, "synthetic-draft", null, preparation);
    remote.validate.mockResolvedValueOnce({ valid: false, error: "Synthetic catalog drift" });
    expect(await preparations.recoverInvoicePreparation(scope())).toBeNull();
    const eventId = preparation.input.fiscalItems[0].classificationEventId;
    await db.proposal_audit_events.update({ where: { event_id: eventId }, data: { payload: "tampered" } });
    expect(await preparations.recoverInvoicePreparation(scope())).toBeNull();
    expect(await classifications.savedClassification({ ...scope(), itemNumber: 1 })).toBeNull();
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: proposalId } })).invoice_draft_id).toBe("synthetic-draft");
  });

  it("allows only one draft replacement and never stores a preparation for a losing request", async () => {
    const results = await Promise.all(["draft-a", "draft-b"].map(id => invoices.saveProposalInvoiceDraftByTenant(tenantId, proposalId, id, null, preparation)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.proposal_audit_events.count({ where: { proposal_id: proposalId, event_type: "invoice_preparation_saved" } })).toBe(1);
  });

  it("rolls back the local draft reference if saving its evidence fails", async () => {
    await db.$executeRawUnsafe("ALTER TABLE proposal_audit_events ADD CONSTRAINT synthetic_preparation_failure CHECK (event_type <> 'invoice_preparation_saved') NOT VALID");
    try {
      await expect(invoices.saveProposalInvoiceDraftByTenant(tenantId, proposalId, "synthetic-draft", null, preparation)).rejects.toThrow();
      expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: proposalId } })).invoice_draft_id).toBeNull();
    } finally { await db.$executeRawUnsafe("ALTER TABLE proposal_audit_events DROP CONSTRAINT synthetic_preparation_failure"); }
  });
});
