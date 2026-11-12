import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn(), visible: vi.fn(), invoice: vi.fn(), enabled: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/proposals", () => ({ isProposalVisibleToViewer: m.visible }));
vi.mock("@/lib/db/proposal-invoices", () => ({ getProposalInvoiceStatusByTenant: m.invoice }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: m.enabled, fetchBillingDraftPdf: m.pdf }));
import { GET } from "./route";
const ctx = { params: Promise.resolve({ proposalId: "synthetic-proposal" }) };
const request = (download = false) => new Request("https://cotiza.test/api/proposals/synthetic-proposal/invoice/pdf" + (download ? "?download=1" : ""));
beforeEach(() => {
  vi.resetAllMocks();
  m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user" });
  m.visible.mockResolvedValue(true); m.enabled.mockReturnValue(true);
  m.invoice.mockResolvedValue({ status: "draft", draftId: "synthetic-draft" });
  m.pdf.mockResolvedValue(Buffer.from("%PDF-synthetic"));
});
it.each([true, false])("entrega prefactura privada como descarga=%s sin timbrar", async download => {
  const response = await GET(request(download), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/pdf");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Disposition")).toBe(`${download ? "attachment" : "inline"}; filename="prefactura_synthetic-proposal.pdf"`);
  expect(await response.text()).toBe("%PDF-synthetic");
  expect(m.pdf).toHaveBeenCalledExactlyOnceWith("synthetic-draft");
  expect(m.invoice).toHaveBeenCalledWith("tenant-a", "synthetic-proposal");
});
it("no expone el PDF de otra empresa o propuesta invisible", async () => {
  m.visible.mockResolvedValue(false);
  expect((await GET(request(true), ctx)).status).toBe(404);
  expect(m.pdf).not.toHaveBeenCalled(); expect(m.invoice).not.toHaveBeenCalled();
});
it("requiere sesión, capacidad fiscal y prefactura existente", async () => {
  m.tenant.mockResolvedValueOnce(null);
  expect((await GET(request(), ctx)).status).toBe(401);
  m.enabled.mockReturnValueOnce(false);
  expect((await GET(request(), ctx)).status).toBe(403);
  m.invoice.mockResolvedValue({ draftId: null });
  expect((await GET(request(), ctx)).status).toBe(404);
  expect(m.pdf).not.toHaveBeenCalled();
});
it("un fallo del generador devuelve error sin documento", async () => {
  m.pdf.mockRejectedValue(new Error("PDF no disponible"));
  const response = await GET(request(true), ctx);
  expect(response.status).toBe(502); expect(response.headers.get("Content-Type")).toContain("application/json");
});
