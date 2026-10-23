import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const remote = vi.hoisted(() => ({ session: vi.fn(), stamp: vi.fn(), state: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: remote.session }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({
  isDigestorFiscalEnabledForTenant: () => true,
  stampBillingDraft: remote.stamp,
  getBillingDraftStampResult: remote.state,
  createBillingDraft: remote.create,
}));

const testUrl = process.env.COTIZA_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
const tenant = "invoice-fixture-a", otherTenant = "invoice-fixture-b";
const seller = "invoice-seller-a", peer = "invoice-peer-a";
let db: typeof import("./prisma").prisma;
let service: typeof import("./proposal-invoices");
let stamp: typeof import("@/app/api/proposals/[proposalId]/invoice/stamp/route").POST;
let reconcile: typeof import("@/app/api/proposals/[proposalId]/invoice/reconcile/route").POST;
let create: typeof import("@/app/api/proposals/[proposalId]/invoice/route").POST;
let proposalId: string;
let sequence = 0;
const signed = { ok: true, uuid: "fictional-uuid", xmlBase64: "ZmljdGlvbmFsLXhtbA==" };
const req = () => new Request("http://localhost/api/test", { method: "POST" });
const ctx = () => ({ params: Promise.resolve({ proposalId }) });
const read = () => db.proposals.findUniqueOrThrow({ where: { proposal_id: proposalId } });
function asUser(tenantId = tenant, userId = seller, role = "user") {
  remote.session.mockResolvedValue({ id: tenantId, userId, userRole: role, isSuperAdmin: false });
}

suite("Invoice safety against disposable PostgreSQL; fiscal provider simulated", () => {
  beforeAll(async () => {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(testUrl!).hostname)) {
      throw new Error("Disposable localhost database required");
    }
    process.env.DATABASE_URL = testUrl;
    ({ prisma: db } = await import("./prisma"));
    service = await import("./proposal-invoices");
    ({ POST: stamp } = await import("@/app/api/proposals/[proposalId]/invoice/stamp/route"));
    ({ POST: reconcile } = await import("@/app/api/proposals/[proposalId]/invoice/reconcile/route"));
    ({ POST: create } = await import("@/app/api/proposals/[proposalId]/invoice/route"));
    for (const id of [tenant, otherTenant]) {
      await db.tenant.create({ data: { tenant_id: id, slug: id, name: id, created_at: new Date() } });
    }
  }, 30_000);
  beforeEach(async () => {
    vi.resetAllMocks();
    asUser();
    remote.stamp.mockResolvedValue(signed);
    proposalId = `invoice-fixture-${++sequence}`;
    await db.proposals.create({ data: {
      proposal_id: proposalId, tenant_id: tenant, status: "draft", created_by: seller,
      created_by_user_id: seller, created_at: new Date(), invoice_draft_id: "draft-original", invoice_status: "draft",
    } });
  });
  afterAll(async () => { if (db) await db.$disconnect(); });

  it("reserves once before the provider call; a concurrent request cannot issue again", async () => {
    let entered!: () => void, finish!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const release = new Promise<void>(resolve => { finish = resolve; });
    remote.stamp.mockImplementation(async () => { entered(); await release; return signed; });
    const first = stamp(req(), ctx());
    await started;
    try {
      expect((await read()).invoice_status).toBe("stamping");
      expect((await stamp(req(), ctx())).status).toBe(409);
      expect(await service.saveProposalInvoiceDraftByTenant(tenant, proposalId, "draft-replacement")).toBe(false);
      expect(remote.stamp).toHaveBeenCalledTimes(1);
    } finally { finish(); }
    expect((await first).status).toBe(200);
    expect(await read()).toMatchObject({ invoice_draft_id: "draft-original", invoice_status: "stamped", invoice_uuid: signed.uuid });
  });

  it("keeps a timeout reserved and reconciles the original result without another stamp", async () => {
    remote.stamp.mockRejectedValue(new Error("simulated timeout"));
    expect((await stamp(req(), ctx())).status).toBe(502);
    expect((await stamp(req(), ctx())).status).toBe(409);
    remote.state.mockResolvedValue({ stampStatus: "stamped", uuid: signed.uuid, xmlBase64: signed.xmlBase64 });
    expect((await reconcile(req(), ctx())).status).toBe(200);
    expect(remote.stamp).toHaveBeenCalledTimes(1);
    expect(remote.state).toHaveBeenCalledWith("draft-original");
    expect(await read()).toMatchObject({ invoice_status: "stamped", invoice_uuid: signed.uuid, invoice_xml_base64: signed.xmlBase64 });
  });

  it.each(["unknown", "processing"])("does not reopen an unresolved %s result", async stampStatus => {
    await service.claimProposalInvoiceStampByTenant(tenant, proposalId, "draft-original");
    remote.state.mockResolvedValue({ stampStatus, uuid: null, xmlBase64: null });
    expect((await reconcile(req(), ctx())).status).toBe(409);
    expect(await service.saveProposalInvoiceDraftByTenant(tenant, proposalId, "new-draft")).toBe(false);
    expect((await read()).invoice_status).toBe("stamping");
    expect(remote.stamp).not.toHaveBeenCalled();
  });

  it("allows correction only after a confirmed rejection, preserving the original claim until then", async () => {
    remote.stamp.mockResolvedValue({ ok: false, rejectionMessage: "simulated rejection" });
    expect((await stamp(req(), ctx())).status).toBe(422);
    expect((await read()).invoice_status).toBe("rejected");
    expect(await service.saveProposalInvoiceDraftByTenant(tenant, proposalId, "corrected-draft")).toBe(true);
    expect((await read()).invoice_draft_id).toBe("corrected-draft");
  });

  it("hides reconciliation from a peer seller and from a foreign tenant", async () => {
    await service.claimProposalInvoiceStampByTenant(tenant, proposalId, "draft-original");
    for (const [tenantId, userId, role] of [[tenant, peer, "user"], [otherTenant, "foreign-owner", "owner"]]) {
      asUser(tenantId, userId, role);
      expect((await reconcile(req(), ctx())).status).toBe(404);
    }
    expect(remote.state).not.toHaveBeenCalled();
    expect((await read()).invoice_status).toBe("stamping");
    asUser(tenant, "manager", "owner");
    remote.state.mockResolvedValue({ stampStatus: "unknown", uuid: null, xmlBase64: null });
    expect((await reconcile(req(), ctx())).status).toBe(409);
    expect(remote.state).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale tenant or draft identifier before updating fiscal state", async () => {
    expect(await service.claimProposalInvoiceStampByTenant(otherTenant, proposalId, "draft-original")).toBe(false);
    expect(await service.claimProposalInvoiceStampByTenant(tenant, proposalId, "wrong-draft")).toBe(false);
    expect(await service.claimProposalInvoiceStampByTenant(tenant, proposalId, "draft-original")).toBe(true);
    expect(await service.markProposalInvoiceStampedByTenant(tenant, proposalId, "wrong-draft", signed.uuid, signed.xmlBase64)).toBe(false);
    expect(await read()).toMatchObject({ invoice_status: "stamping", invoice_uuid: null });
  });

  it.each([
    { invoice_uuid: "historic-uuid" },
    { invoice_xml_base64: "historic-xml" },
    { invoice_stamped_at: new Date("2026-01-01T00:00:00Z") },
  ])("preserves existing fiscal evidence even with an inconsistent draft status: %j", async evidence => {
    await db.proposals.update({ where: { proposal_id: proposalId }, data: evidence });
    const before = await read();
    expect(await service.saveProposalInvoiceDraftByTenant(tenant, proposalId, "replacement")).toBe(false);
    expect(await service.claimProposalInvoiceStampByTenant(tenant, proposalId, "draft-original")).toBe(false);
    expect((await stamp(req(), ctx())).status).toBe(409);
    const payload = new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      customerName: "Fictional", customerRegimen: "601", customerRfc: "AAA010101AAA", customerUseCfdi: "G03",
      customerZip: "06100", paymentForm: "03", paymentMethod: "PUE",
    }) });
    expect((await create(payload, ctx())).status).toBe(409);
    expect(remote.create).not.toHaveBeenCalled();
    expect(remote.stamp).not.toHaveBeenCalled();
    expect(await read()).toEqual(before);
    await db.proposals.update({ where: { proposal_id: proposalId }, data: { invoice_status: "stamping" } });
    expect(await service.markProposalInvoiceRejectedByTenant(tenant, proposalId, "draft-original")).toBe(false);
    expect(await service.markProposalInvoiceStampedByTenant(tenant, proposalId, "draft-original", "overwrite", "overwrite")).toBe(false);
    expect(await read()).toMatchObject(evidence);
  });
});
