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
const req = () => new Request("http://localhost/api/proposals/p1/invoice/stamp", { method: "POST" });

describe("timbrado: nunca emitir dos veces", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.visible.mockResolvedValue(true);
    mocks.getCurrentTenantContext.mockResolvedValue({ id: "t1", userId: "seller-1", userRole: "user", isSuperAdmin: false });
    mocks.enabled.mockReturnValue(true);
    mocks.getInvoice.mockResolvedValue({ draftId: "d1", status: "draft" });
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

  it("persiste UUID/XML cuando PAC confirma éxito", async () => {
    mocks.stamp.mockResolvedValue({ ok: true, uuid: "u1", xmlBase64: "c2lnbmVk" });
    expect((await POST(req(), ctx)).status).toBe(200);
    expect(mocks.markStamped).toHaveBeenCalledWith("t1", "p1", "d1", "u1", "c2lnbmVk");
    expect(mocks.markRejected).not.toHaveBeenCalled();
  });

  it("mantiene bloqueado el timbrado ante timeout incierto", async () => {
    mocks.stamp.mockRejectedValue(new Error("timeout"));
    expect((await POST(req(), ctx)).status).toBe(502);
    expect(mocks.markRejected).not.toHaveBeenCalled();
    expect(mocks.markStamped).not.toHaveBeenCalled();
  });

  it("permite corregir solo ante rechazo explícito del PAC", async () => {
    mocks.stamp.mockResolvedValue({ ok: false, rejectionMessage: "RFC invalido" });
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
    mocks.stamp.mockResolvedValue({ ok: false, rejectionMessage: "simulated rejection" });
    mocks.markRejected.mockResolvedValue(false);
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(mocks.markStamped).not.toHaveBeenCalled();
  });

  it("no permite timbrar sin tenant", async () => {
    mocks.getCurrentTenantContext.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(401);
    expect(mocks.stamp).not.toHaveBeenCalled();
  });
});
