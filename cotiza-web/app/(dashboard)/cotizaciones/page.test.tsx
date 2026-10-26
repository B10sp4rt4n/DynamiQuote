import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), groups: vi.fn(), version: vi.fn(), enabled: vi.fn() }));
vi.mock("@/components/cotizador/quote-shell", () => ({ QuoteShell: () => null }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/quotes", () => ({ getQuoteGroupsSummaryByTenant: m.groups, getQuoteVersionSummaryByTenant: m.version }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.enabled, THREATDOWN_PDF_IMPORT: "import" }));
vi.mock("@/lib/db/tenants", () => ({ getActiveTenants: vi.fn() }));
import QuotesPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  m.tenant.mockResolvedValue({ id: "tenant-a", name: "Tenant A", slug: "a", userId: "seller-a", userRole: "user", isSuperAdmin: false });
  m.groups.mockResolvedValue([]);
  m.version.mockResolvedValue({ quoteId: "COT-0066-v2" });
  m.enabled.mockResolvedValue(false);
});
describe("quotes page historical deep links", () => {
  it("resolves the exact query version using the authenticated seller's scope", async () => {
    const page = await QuotesPage({ searchParams: Promise.resolve({ quoteId: "COT-0066-v2" }) });
    expect(m.version).toHaveBeenCalledWith("tenant-a", "COT-0066-v2", "seller-a", false);
    expect(page.props.requestedQuote).toEqual({ quoteId: "COT-0066-v2" });
  });
  it("ignores ambiguous duplicate quoteId parameters", async () => {
    const page = await QuotesPage({ searchParams: Promise.resolve({ quoteId: ["v2", "foreign"] }) });
    expect(m.version).not.toHaveBeenCalled();
    expect(page.props.requestedQuote).toBeNull();
  });
  it("does not query commercial data without an authenticated tenant", async () => {
    m.tenant.mockResolvedValue(null);
    await QuotesPage({ searchParams: Promise.resolve({ quoteId: "COT-0066-v2" }) });
    expect(m.version).not.toHaveBeenCalled();
    expect(m.groups).not.toHaveBeenCalled();
  });
});
