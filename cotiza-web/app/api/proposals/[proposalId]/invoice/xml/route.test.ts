import { beforeEach, expect, it, vi } from "vitest";
import { INVOICE_UUID, INVOICE_XML, INVOICE_BASE64 } from "@/tests/fixtures/synthetic-invoice";
const m = vi.hoisted(() => ({ tenant: vi.fn(), visible: vi.fn(), invoice: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/proposals", () => ({ isProposalVisibleToViewer: m.visible }));
vi.mock("@/lib/db/proposal-invoices", () => ({ getProposalInvoiceStatusByTenant: m.invoice }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: () => true }));
import { GET } from "./route";
const ctx = { params: Promise.resolve({ proposalId: "synthetic" }) };
const req = () => new Request("https://cotiza.test/xml");
beforeEach(() => {
  vi.resetAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user" });
  m.visible.mockResolvedValue(true);
  m.invoice.mockResolvedValue({ status: "stamped", uuid: INVOICE_UUID, xmlBase64: INVOICE_BASE64 });
});
it("descarga el XML original, privado y sin regeneración", async () => {
  const response = await GET(req(), ctx);
  expect(response.status).toBe(200); expect(await response.text()).toBe(INVOICE_XML);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Disposition")).toContain(INVOICE_UUID+".xml");
  expect(m.invoice).toHaveBeenCalledWith("tenant-a", "synthetic");
});
it("no entrega XML de un UUID distinto", async () => {
  m.invoice.mockResolvedValue({ status: "stamped", uuid: "22222222-2222-4333-8444-555555555555", xmlBase64: INVOICE_BASE64 });
  expect((await GET(req(), ctx)).status).toBe(409);
});
it("una prefactura no se descarga como XML timbrado", async () => {
  m.invoice.mockResolvedValue({ status: "draft", uuid: null, xmlBase64: null });
  expect((await GET(req(), ctx)).status).toBe(404);
});
