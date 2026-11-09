import { INVOICE_UUID, INVOICE_BASE64 } from "@/tests/fixtures/synthetic-invoice";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visible: vi.fn(),
  tenant: vi.fn(),
  enabled: vi.fn(),
  getInvoice: vi.fn(),
  readRemote: vi.fn(), recover: vi.fn(),
  markStamped: vi.fn(),
  markRejected: vi.fn(),
}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.tenant }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({
  isDigestorFiscalEnabledForTenant: mocks.enabled,
  getBillingDraftStampResult: mocks.readRemote, recoverBillingDraftStampResult: mocks.recover,
}));
vi.mock("@/lib/db/proposal-invoices", () => ({
  getProposalInvoiceStatusByTenant: mocks.getInvoice,
  markProposalInvoiceStampedByTenant: mocks.markStamped,
  markProposalInvoiceRejectedByTenant: mocks.markRejected,
}));

vi.mock("@/lib/db/proposals", () => ({ isProposalVisibleToViewer: mocks.visible }));

import { POST } from "./route";
const ctx = { params: Promise.resolve({ proposalId: "p1" }) };
const req = () => new Request("http://localhost/api/proposals/p1/invoice/reconcile", { method: "POST" });

describe("conciliar factura sin volver a emitir", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.visible.mockResolvedValue(true);
    mocks.tenant.mockResolvedValue({ id: "t1", userId: "seller-1", userRole: "user", isSuperAdmin: false });
    mocks.enabled.mockReturnValue(true);
    mocks.getInvoice.mockResolvedValue({ draftId: "d1", status: "stamping" });
    mocks.markStamped.mockResolvedValue(true);
    mocks.markRejected.mockResolvedValue(true);
  });

  it("recupera UUID y XML timbrados", async () => {
    mocks.readRemote.mockResolvedValue({ stampStatus: "stamped", uuid: INVOICE_UUID, xmlBase64: INVOICE_BASE64 });
    const response = await POST(req(), ctx);
    expect(response.status).toBe(200);
    expect(mocks.readRemote).toHaveBeenCalledWith("d1");
    expect(mocks.markStamped).toHaveBeenCalledWith("t1", "p1", "d1", INVOICE_UUID, INVOICE_BASE64);
  });

  it("ante resultado desconocido no libera el bloqueo", async () => {
    mocks.readRemote.mockResolvedValue({ stampStatus: "unknown", uuid: null, xmlBase64: null });
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.markRejected).not.toHaveBeenCalled();
    expect(mocks.markStamped).not.toHaveBeenCalled();
  });

  it("ante timbrado en progreso tampoco libera el bloqueo", async () => {
    mocks.readRemote.mockResolvedValue({ stampStatus: "processing", uuid: null, xmlBase64: null });
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.markRejected).not.toHaveBeenCalled();
  });

  it("solo un rechazo explícito permite volver a prefacturar", async () => {
    mocks.readRemote.mockResolvedValue({ stampStatus: "rejected", uuid: null, xmlBase64: null });
    expect((await POST(req(), ctx)).status).toBe(200);
    expect(mocks.markRejected).toHaveBeenCalledWith("t1", "p1", "d1");
  });

  it("no acepta una respuesta de éxito sin XML/UUID", async () => {
    mocks.readRemote.mockResolvedValue({ stampStatus: "stamped", uuid: null, xmlBase64: null });
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.markStamped).not.toHaveBeenCalled();
  });

  it("requiere autenticación", async () => {
    mocks.tenant.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(401);
    expect(mocks.readRemote).not.toHaveBeenCalled();
  });
  it("no libera si la consulta se adelantó al envío original", async () => {
    mocks.readRemote.mockResolvedValue({ stampStatus: "not_sent", uuid: null, xmlBase64: null });
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.markRejected).not.toHaveBeenCalled();
  });
  it("recupera por UUID sólo con confirmación explícita del mismo borrador", async () => {
    mocks.recover.mockResolvedValue({ stamp_status: "stamped", uuid: INVOICE_UUID, xml_base64: INVOICE_BASE64 });
    const request = new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ expectedDraftId: "d1", invoiceUuid: INVOICE_UUID, confirm: true }) });
    expect((await POST(request, ctx)).status).toBe(200);
    expect(mocks.recover).toHaveBeenCalledWith("d1", INVOICE_UUID);
    expect(mocks.readRemote).not.toHaveBeenCalled();
  });
  it.each([
    { expectedDraftId: "d1", invoiceUuid: INVOICE_UUID, confirm: false },
    { expectedDraftId: "d1", invoiceUuid: "inventado", confirm: true },
    { expectedDraftId: "d1", invoiceUuid: INVOICE_UUID, confirm: true, extra: "x" },
  ])("rechaza recuperación sin contrato válido: %j", async body => {
    expect((await POST(new Request("http://localhost/test", { method: "POST", body: JSON.stringify(body) }), ctx)).status).toBe(422);
    expect(mocks.recover).not.toHaveBeenCalled();
  });
  it("un XML de otro UUID no se guarda ni libera el timbrado", async () => {
    mocks.readRemote.mockResolvedValue({ stampStatus: "stamped", uuid: "22222222-2222-4333-8444-555555555555", xmlBase64: INVOICE_BASE64 });
    expect((await POST(req(), ctx)).status).toBe(502);
    expect(mocks.markStamped).not.toHaveBeenCalled();
    expect(mocks.markRejected).not.toHaveBeenCalled();
  });
});
