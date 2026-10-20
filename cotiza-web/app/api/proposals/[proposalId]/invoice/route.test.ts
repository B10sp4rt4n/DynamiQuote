import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
}));
vi.mock("@/lib/db/proposal-invoices", () => ({
  getProposalInvoiceStatusByTenant: mocks.getInvoice,
  getClientFiscalDataForProposalByTenant: mocks.getFiscalData,
  saveProposalInvoiceDraftByTenant: mocks.saveDraft,
}));
vi.mock("@/lib/db/clients", () => ({ updateClientForTenant: mocks.updateClient }));
vi.mock("@/lib/db/proposals", () => ({ getProposalWorkflowByTenant: mocks.getProposal }));
vi.mock("@/lib/db/tenants", () => ({ getTenantProfileByTenant: mocks.getTenantProfile }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ proposalId: "p1" }) };
const request = () => new Request("http://localhost/api/proposals/p1/invoice", {
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
  }),
});

describe("no regenerar prefacturas timbradas", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tenant.mockResolvedValue({ id: "t1", name: "Emisor" });
    mocks.enabled.mockReturnValue(true);
    mocks.getInvoice.mockResolvedValue({ status: "draft", draftId: "d1" });
    mocks.getProposal.mockResolvedValue({
      outcome: "won",
      items: [{ description: "Servicio", quantity: 1, priceUnit: 100 }],
      formal: { currency: "MXN" },
      proposalId: "p1",
    });
    mocks.getTenantProfile.mockResolvedValue({ rfc: "AAA010101AAA", razonSocial: "Emisor", fiscalRegime: "601", fiscalZipCode: "06100" });
    mocks.createDraft.mockResolvedValue({ id: "d2" });
    mocks.saveDraft.mockResolvedValue(true);
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
    expect(mocks.saveDraft).toHaveBeenCalledWith("t1", "p1", "d2");
  });

  it("para nuevas prefacturas, conserva el flujo existente", async () => {
    expect((await POST(request(), ctx)).status).toBe(201);
    expect(mocks.saveDraft).toHaveBeenCalledWith("t1", "p1", "d2");
  });
});
