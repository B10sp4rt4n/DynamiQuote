import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/invoice-preparations", () => ({ recoverInvoicePreparation: async () => null }));
vi.mock("@/lib/db/fiscal-classifications", () => ({ verifyClassification: mocks.verify }));

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  verify: vi.fn(),
  visible: vi.fn(),
  tenant: vi.fn(),
  enabled: vi.fn(),
  createDraft: vi.fn(),
  getInvoice: vi.fn(),
  saveDraft: vi.fn(),
  getFiscalData: vi.fn(),
  updateClient: vi.fn(),
  getProposal: vi.fn(),
  getTenantProfile: vi.fn(),
}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.tenant }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({
  isDigestorFiscalEnabledForTenant: mocks.enabled,
  createBillingDraft: mocks.createDraft,
  validateSatClassifications: mocks.validate,
}));
vi.mock("@/lib/db/proposal-invoices", () => ({
  getProposalInvoiceStatusByTenant: mocks.getInvoice,
  getClientFiscalDataForProposalByTenant: mocks.getFiscalData,
  saveProposalInvoiceDraftByTenant: mocks.saveDraft,
}));
vi.mock("@/lib/db/clients", () => ({ updateClientForTenant: mocks.updateClient }));
vi.mock("@/lib/db/proposals", () => ({ getProposalWorkflowByTenant: mocks.getProposal, isProposalVisibleToViewer: mocks.visible }));
vi.mock("@/lib/db/tenants", () => ({ getTenantProfileByTenant: mocks.getTenantProfile }));

import { GET, POST } from "./route";
import { invoiceBasisFingerprint } from "@/lib/domain/invoice-profile";

const proposalFixture = { outcome: "won", items: [{ itemNumber: 1, description: "Servicio", quantity: 1, priceUnit: 100 }],
  formal: { currency: "MXN" }, proposalId: "p1" };

const ctx = { params: Promise.resolve({ proposalId: "p1" }) };
const request = (overrides: Record<string, unknown> = {}) => new Request("http://localhost/api/proposals/p1/invoice", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    customerName: "Empresa de prueba",
    customerRegimen: "601",
    customerRfc: "AAA010101AAA",
    customerUseCfdi: "G03",
    customerZip: "06100",
    paymentForm: "03",
    paymentMethod: "PUE",
    itemsFingerprint: invoiceBasisFingerprint(proposalFixture),
    fiscalItems: [{ itemNumber: 1, satProductCode: "80101500", unitCode: "E48",
      catalogVersion: "b".repeat(64), classificationEventId: "fcl_" + "c".repeat(64) }],
    ...overrides,
  }),
});

describe("no regenerar prefacturas timbradas", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.validate.mockResolvedValue({ valid: true });
    mocks.verify.mockResolvedValue(true);
    mocks.visible.mockResolvedValue(true);
    mocks.tenant.mockResolvedValue({ id: "t1", name: "Emisor", userId: "seller-1", userRole: "user", isSuperAdmin: false });
    mocks.enabled.mockReturnValue(true);
    mocks.getInvoice.mockResolvedValue({ status: "draft", draftId: "d1" });
    mocks.getProposal.mockResolvedValue(proposalFixture);
    mocks.getTenantProfile.mockResolvedValue({ rfc: "AAA010101AAA", razonSocial: "Emisor", fiscalRegime: "601", fiscalZipCode: "06100" });
    mocks.createDraft.mockResolvedValue({ id: "d2" });
    mocks.saveDraft.mockResolvedValue(true);
  });

  it.each([
    [],
    [{ itemNumber: 2, satProductCode: "80101500", unitCode: "E48" }],
    [1, 1].map(itemNumber => ({ itemNumber, satProductCode: "80101500", unitCode: "E48" })),
    [{ itemNumber: 1, satProductCode: "80101500", unitCode: "E48", unitPrice: 1 }],
  ].map(fiscalItems => ({ fiscalItems })))("rejects incomplete, unknown, duplicated or injected fields ($fiscalItems)", async ({ fiscalItems }) => {
    expect((await POST(request({ fiscalItems }), ctx)).status).toBe(422);
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  afterEach(() => { vi.unstubAllEnvs(); delete process.env["DIGESTOR_FISCAL_PPD_ENABLED"]; });
  it.each([['user',false],['owner',true],['admin',true]])('shows production fiscal actions only for administrative %s scope',async(role,expected)=>{
    vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');vi.stubEnv('DIGESTOR_FISCAL_CANCELLATION_ENABLED','true');vi.stubEnv('DIGESTOR_FISCAL_CORRECTIONS_ENABLED','true');
    mocks.tenant.mockResolvedValue({id:'t1',userId:'actor',userRole:role,authMode:'clerk'});
    const result=await (await GET(new Request('https://cotiza.test/invoice'),ctx)).json();
    expect(result.cancellationEnabled).toBe(expected);expect(result.correctionsEnabled).toBe(expected);
  });
  it('hides production fiscal controls from bootstrap identity',async()=>{
    vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');vi.stubEnv('DIGESTOR_FISCAL_CANCELLATION_ENABLED','true');
    mocks.tenant.mockResolvedValue({id:'t1',userId:'bootstrap',userRole:'owner',authMode:'bootstrap'});
    expect((await (await GET(new Request('https://cotiza.test/invoice'),ctx)).json()).cancellationEnabled).toBe(false);
  });
  it("rejects PPD by default and accepts the explicit feature gate", async () => {
    expect((await POST(request({ paymentMethod: "PPD", paymentForm: "99" }), ctx)).status).toBe(403);
    mocks.createDraft.mockClear();
    process.env["DIGESTOR_FISCAL_PPD_ENABLED"] = "true";
    expect((await POST(request({ paymentMethod: "PPD", paymentForm: "99" }), ctx)).status).toBe(201);
    expect(mocks.createDraft.mock.calls[0][0]).toMatchObject({ paymentMethod: "PPD", paymentForm: "99" });
  });

  it("bloquea prefactura cuando ya fue timbrada", async () => {
    mocks.getInvoice.mockResolvedValue({ status: "stamped", draftId: "d1" });
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  it("bloquea prefactura cuando la emision es incierta", async () => {
    mocks.getInvoice.mockResolvedValue({ status: "stamping", draftId: "d1" });
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  it("si otra solicitud cambia el estado, no pisa el draftId local", async () => {
    mocks.saveDraft.mockResolvedValue(false);
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(mocks.saveDraft).toHaveBeenCalledWith("t1", "p1", "d2", "d1", expect.objectContaining({ actorUserId: "seller-1" }));
  });

  it("preserves null as the expected draft on initial creation", async () => {
    mocks.getInvoice.mockResolvedValue({ status: null, draftId: null });
    expect((await POST(request(), ctx)).status).toBe(201);
    expect(mocks.saveDraft).toHaveBeenCalledWith("t1", "p1", "d2", null, expect.objectContaining({ actorUserId: "seller-1" }));
  });

  it("para nuevas prefacturas, conserva el flujo existente", async () => {
    expect((await POST(request(), ctx)).status).toBe(201);
    expect(mocks.saveDraft).toHaveBeenCalledWith("t1", "p1", "d2", "d1", expect.objectContaining({ actorUserId: "seller-1" }));
    expect(mocks.createDraft.mock.calls[0][0].items[0]).toMatchObject({ satProductCode: "80101500", unitCode: "E48", taxRate: 0.16 });
  });
  it("rejects a changed proposal before creating a remote draft", async () => {
    mocks.getProposal.mockResolvedValue({ ...proposalFixture, items: [{ ...proposalFixture.items[0], priceUnit: 200 }] });
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });
  it("does not relabel a USD proposal as MXN for billing", async () => {
    mocks.getProposal.mockResolvedValue({ ...proposalFixture, formal: { currency: "USD" } });
    expect((await POST(request(), ctx)).status).toBe(422);
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });
  it("rejects nonexistent codes and changed catalog versions before generating a draft", async () => {
    mocks.validate.mockResolvedValue({ valid: false });
    expect((await POST(request(), ctx)).status).toBe(422);
    mocks.validate.mockResolvedValue({ valid: false, error: "El catálogo cambió" });
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });
  it("rejects a confirmation from another actor or document revision", async () => {
    mocks.verify.mockResolvedValue(false);
    const fiscalItems = [{ itemNumber: 1, satProductCode: "80101500", unitCode: "E48", catalogVersion: "b".repeat(64), classificationEventId: "fcl_" + "c".repeat(64) }];
    expect((await POST(request({ fiscalItems }), ctx)).status).toBe(409);
    expect(mocks.verify.mock.calls[0][0]).toMatchObject({ tenantId: "t1", actorUserId: "seller-1", proposalId: "p1", fingerprint: invoiceBasisFingerprint(proposalFixture) });
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });
  it("rejects direct requests that omit classification receipts before consulting the catalog", async () => {
    const fiscalItems = [{ itemNumber: 1, satProductCode: "80101500", unitCode: "E48" }];
    expect((await POST(request({ fiscalItems }), ctx)).status).toBe(422);
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });
});
