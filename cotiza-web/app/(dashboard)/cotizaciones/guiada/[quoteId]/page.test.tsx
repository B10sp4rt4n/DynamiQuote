import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), cap: vi.fn(), visible: vi.fn(), lines: vi.fn(), policy: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.cap }));
vi.mock("@/lib/db/quotes", () => ({ isQuoteVisibleToViewer: m.visible }));
vi.mock("@/lib/db/quote-editor", () => ({ getEditableQuoteLinesByTenant: m.lines }));
vi.mock("@/lib/db/margin-policies", () => ({ getMarginPolicyByTenant: m.policy }));
vi.mock("@/components/cotizador/guided-quote-preview", () => ({ GuidedQuotePreview: () => null }));
import Page from "./page";
const params = () => ({ params: Promise.resolve({ quoteId: "q1" }) });
beforeEach(() => {
  vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", isSuperAdmin: false, userRole: "user" });
  m.cap.mockResolvedValue(true); m.visible.mockResolvedValue(true); m.lines.mockResolvedValue([{ sku: "TEST" }]); m.policy.mockResolvedValue({ minMarginPct: 19 });
});
describe("guided preview access", () => {
  it("requires a session before querying commercial information", async () => {
    m.tenant.mockResolvedValue(null); await expect(Page(params())).rejects.toThrow("404"); expect(m.cap).not.toHaveBeenCalled(); expect(m.lines).not.toHaveBeenCalled();
  });
  it("is disabled unless the tenant is explicitly enabled", async () => {
    m.cap.mockResolvedValue(false); await expect(Page(params())).rejects.toThrow("404"); expect(m.visible).not.toHaveBeenCalled(); expect(m.lines).not.toHaveBeenCalled();
  });
  it("checks seller visibility before loading lines or policy", async () => {
    m.visible.mockResolvedValue(false); await expect(Page(params())).rejects.toThrow("404"); expect(m.lines).not.toHaveBeenCalled(); expect(m.policy).not.toHaveBeenCalled();
  });
  it("uses authenticated tenant and seller and its own margin policy", async () => {
    await Page(params());
    expect(m.cap).toHaveBeenCalledWith("tenant-a", "cpq_guided_preview");
    expect(m.visible).toHaveBeenCalledWith("tenant-a", "q1", "seller-a", false);
    expect(m.lines).toHaveBeenCalledWith("tenant-a", "q1"); expect(m.policy).toHaveBeenCalledWith("tenant-a");
  });
});
