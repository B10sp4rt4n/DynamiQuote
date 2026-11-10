import { INVOICE_UUID, INVOICE_BASE64 } from "@/tests/fixtures/synthetic-invoice";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visible: vi.fn(),
  getCurrentTenantContext: vi.fn(),
  enabled: vi.fn(),
  getInvoice: vi.fn(),
  claim: vi.fn(),
  stamp: vi.fn(),
  markStamped: vi.fn(),
  markRejected: vi.fn(),
}));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: mocks.getCurrentTenantContext,
}));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({
  isDigestorFiscalEnabledForTenant: mocks.enabled,
  stampBillingDraft: mocks.stamp,
}));
vi.mock("@/lib/db/proposal-invoices", () => ({
  getProposalInvoiceStatusByTenant: mocks.getInvoice,
  claimProposalInvoiceStampByTenant: mocks.claim,
  markProposalInvoiceStampedByTenant: mocks.markStamped,
  markProposalInvoiceRejectedByTenant: mocks.markRejected,
}));

vi.mock("@/lib/db/proposals", () => ({ isProposalVisibleToViewer: mocks.visible }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ proposalId: "p1" }) };
const req = () => new Request("http://localhost/api/proposals/p1/invoice/stamp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedDraftId: "d1", confirm: true }) });

describe("timbrado: nunca emitir dos veces", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.visible.mockResolvedValue(true);
    mocks.getCurrentTenantContext.mockResolvedValue({ id: "t1", userId: "seller-1", userRole: "user", isSuperAdmin: false });
    mocks.enabled.mockReturnValue(true);
    mocks.getInvoice.mockResolvedValue({ draftId: "d1", status: "draft", outcome: "won" });
    mocks.claim.mockResolvedValue(true);
    mocks.markStamped.mockResolvedValue(true);
    mocks.markRejected.mockResolvedValue(true);
  });

  it("bloquea otro timbrado si la propuesta ya esta timbrada", async () => {
    mocks.getInvoice.mockResolvedValue({ draftId: "d1", status: "stamped" });
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.stamp).not.toHaveBeenCalled();
  });

  it("bloquea reintento si el estado previo es incierto", async () => {
    mocks.getInvoice.mockResolvedValue({ draftId: "d1", status: "stamping" });
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.stamp).not.toHaveBeenCalled();
  });

  it("si pierde la reserva atomica, nunca llama al PAC", async () => {
    mocks.claim.mockResolvedValue(false);
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.stamp).not.toHaveBeenCalled();
  });

  it.each([null, "lost", "discarded"])("no emite una prefactura anterior si el desenlace actual es %s", async outcome => {
    mocks.getInvoice.mockResolvedValue({ draftId: "d1", status: "draft", outcome });
    expect((await POST(req(), ctx)).status).toBe(422);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.stamp).not.toHaveBeenCalled();
  });

  it("persiste UUID/XML cuando PAC confirma éxito", async () => {
    mocks.stamp.mockResolvedValue({ ok: true, uuid: INVOICE_UUID, xmlBase64: INVOICE_BASE64 });
    expect((await POST(req(), ctx)).status).toBe(200);
    expect(mocks.markStamped).toHaveBeenCalledWith("t1", "p1", "d1", INVOICE_UUID, INVOICE_BASE64);
    expect(mocks.markRejected).not.toHaveBeenCalled();
  });

  it("mantiene bloqueado el timbrado ante timeout incierto", async () => {
    mocks.stamp.mockRejectedValue(new Error("timeout"));
    expect((await POST(req(), ctx)).status).toBe(502);
    expect(mocks.markRejected).not.toHaveBeenCalled();
    expect(mocks.markStamped).not.toHaveBeenCalled();
  });

  it("permite corregir solo ante rechazo explícito del PAC", async () => {
    mocks.stamp.mockResolvedValue({ ok: false, draft: { stampStatus: "rejected" }, rejectionMessage: "RFC invalido" });
    expect((await POST(req(), ctx)).status).toBe(422);
    expect(mocks.markRejected).toHaveBeenCalledWith("t1", "p1", "d1");
  });

  it("no marca timbrado si falta el XML o UUID", async () => {
    mocks.stamp.mockResolvedValue({ ok: true, uuid: null, xmlBase64: null });
    expect((await POST(req(), ctx)).status).toBe(502);
    expect(mocks.markStamped).not.toHaveBeenCalled();
    expect(mocks.markRejected).not.toHaveBeenCalled();
  });

  it("no declara liberada una reserva si el rechazo pierde la comparación de estado", async () => {
    mocks.stamp.mockResolvedValue({ ok: false, draft: { stampStatus: "rejected" }, rejectionMessage: "simulated rejection" });
    mocks.markRejected.mockResolvedValue(false);
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.markStamped).not.toHaveBeenCalled();
  });

  it("no permite timbrar sin tenant", async () => {
    mocks.getCurrentTenantContext.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(401);
    expect(mocks.stamp).not.toHaveBeenCalled();
  });

  it.each([{}, { expectedDraftId: "d1", confirm: false }, { expectedDraftId: "d1", confirm: true, extra: true }])("requiere confirmación exacta: %j", async body => {
    const request = new Request("http://localhost/test", { method: "POST", body: JSON.stringify(body) });
    expect((await POST(request, ctx)).status).toBe(422);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("una pestaña obsoleta no reserva el borrador nuevo", async () => {
    mocks.getInvoice.mockResolvedValue({ draftId: "d2", status: "draft" });
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it.each([
    { ok: false, draft: { stampStatus: "unknown" } },
    { ok: false, draft: { stampStatus: "rejected" }, xmlBase64: INVOICE_BASE64 },
    { ok: true, uuid: "22222222-2222-4333-8444-555555555555", xmlBase64: INVOICE_BASE64 },
    { ok: true, uuid: INVOICE_UUID, xmlBase64: "eG1s" },
  ])("mantiene la reserva ante evidencia contradictoria: %j", async result => {
    mocks.stamp.mockResolvedValue(result);
    expect((await POST(req(), ctx)).status).toBe(502);
    expect(mocks.markStamped).not.toHaveBeenCalled();
    expect(mocks.markRejected).not.toHaveBeenCalled();
  });
});
