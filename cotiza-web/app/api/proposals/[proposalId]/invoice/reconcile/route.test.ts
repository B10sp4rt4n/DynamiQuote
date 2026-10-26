import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visible: vi.fn(),
  tenant: vi.fn(),
  enabled: vi.fn(),
  getInvoice: vi.fn(),
  readRemote: vi.fn(),
  markStamped: vi.fn(),
  markRejected: vi.fn(),
}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.tenant }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({
  isDigestorFiscalEnabledForTenant: mocks.enabled,
  getBillingDraftStampResult: mocks.readRemote,
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
    mocks.readRemote.mockResolvedValue({ stampStatus: "stamped", uuid: "u1", xmlBase64: "eG1s" });
    const response = await POST(req(), ctx);
    expect(response.status).toBe(200);
    expect(mocks.readRemote).toHaveBeenCalledWith("d1");
    expect(mocks.markStamped).toHaveBeenCalledWith("t1", "p1", "d1", "u1", "eG1s");
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
});
