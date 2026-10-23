import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), enabled: vi.fn(), visible: vi.fn(), invoice: vi.fn(), fiscal: vi.fn(), workflow: vi.fn(), create: vi.fn(), stamp: vi.fn(), preview: vi.fn(), pdf: vi.fn(), remoteState: vi.fn(), claim: vi.fn(), reject: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/proposals", () => ({ isProposalVisibleToViewer: m.visible, getProposalWorkflowByTenant: m.workflow }));
vi.mock("@/lib/db/proposal-invoices", () => ({ getProposalInvoiceStatusByTenant: m.invoice, getClientFiscalDataForProposalByTenant: m.fiscal, saveProposalInvoiceDraftByTenant: vi.fn(), markProposalInvoiceStampedByTenant: vi.fn(), claimProposalInvoiceStampByTenant: m.claim, markProposalInvoiceRejectedByTenant: m.reject }));
vi.mock("@/lib/db/clients", () => ({ updateClientForTenant: vi.fn() }));
vi.mock("@/lib/db/tenants", () => ({ getTenantProfileByTenant: vi.fn() }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: m.enabled, createBillingDraft: m.create, stampBillingDraft: m.stamp, fetchBillingDraftPreviewHtml: m.preview, fetchBillingDraftPdf: m.pdf, getBillingDraftStampResult: m.remoteState }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn() }));
vi.mock("@/lib/pdf/cfdi-document", () => ({ CfdiDocument: vi.fn() }));
vi.mock("@/lib/pdf/cfdi-qr", () => ({ buildCfdiQrDataUrl: vi.fn() }));
vi.mock("@/lib/pdf/cfdi-xml", () => ({ parseCfdiXml: vi.fn() }));
import { GET as status, POST as create } from "./route";
import { POST as stamp } from "./stamp/route";
import { GET as preview } from "./preview/route";
import { GET as pdf } from "./pdf/route";
import { POST as reconcile } from "./reconcile/route";
const handlers = [["status", status], ["create", create], ["stamp", stamp], ["preview", preview], ["pdf", pdf], ["reconcile", reconcile]] as const;
const context = () => ({ params: Promise.resolve({ proposalId: "proposal-b" }) });
const request = () => new Request("https://cotiza.test/api/proposals/proposal-b/invoice", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
describe.each(handlers)("invoice %s access", (_name, handler) => {
  beforeEach(() => { vi.resetAllMocks(); m.enabled.mockReturnValue(true); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user", isSuperAdmin: false }); m.visible.mockResolvedValue(true); m.invoice.mockResolvedValue(null); m.fiscal.mockResolvedValue(null); });
  it("requires authentication before resolving invoice or calling fiscal service", async () => {
    m.tenant.mockResolvedValue(null); expect((await handler(request(), context())).status).toBe(401);
    expect(m.visible).not.toHaveBeenCalled(); expect(m.invoice).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled(); expect(m.stamp).not.toHaveBeenCalled(); expect(m.remoteState).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled(); expect(m.reject).not.toHaveBeenCalled();
  });
  it("rejects a tenant without the fiscal capability before reading or reserving an invoice", async () => {
    m.enabled.mockReturnValue(false);
    expect((await handler(request(), context())).status).toBe(403);
    expect(m.visible).not.toHaveBeenCalled(); expect(m.invoice).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled(); expect(m.stamp).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled(); expect(m.remoteState).not.toHaveBeenCalled();
  });
  it("hides another seller's proposal before reading or performing fiscal operations", async () => {
    m.visible.mockResolvedValue(false); expect((await handler(request(), context())).status).toBe(404);
    expect(m.visible).toHaveBeenCalledWith("tenant-a", "proposal-b", "seller-a", false);
    expect(m.invoice).not.toHaveBeenCalled(); expect(m.fiscal).not.toHaveBeenCalled(); expect(m.workflow).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled(); expect(m.stamp).not.toHaveBeenCalled(); expect(m.remoteState).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled(); expect(m.reject).not.toHaveBeenCalled(); expect(m.preview).not.toHaveBeenCalled(); expect(m.pdf).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin", "superadmin"])("passes current tenant and explicit %s scope to access gate", async (role) => {
    m.tenant.mockResolvedValue({ id: "tenant-a", userId: "manager", userRole: role, isSuperAdmin: role === "superadmin" });
    await handler(request(), context()); expect(m.visible).toHaveBeenCalledWith("tenant-a", "proposal-b", "manager", true);
    for (const call of m.invoice.mock.calls) expect(call).toEqual(["tenant-a", "proposal-b"]);
    expect(m.create).not.toHaveBeenCalled(); expect(m.stamp).not.toHaveBeenCalled(); expect(m.remoteState).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled(); expect(m.reject).not.toHaveBeenCalled(); expect(m.preview).not.toHaveBeenCalled(); expect(m.pdf).not.toHaveBeenCalled();
  });
});
