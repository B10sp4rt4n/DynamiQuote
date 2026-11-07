vi.mock("@/lib/db/opportunities", () => ({ getOpportunityPipelineByTenant: m.opportunities }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ opportunities: vi.fn(), tenant: vi.fn(), groups: vi.fn(), version: vi.fn(), enabled: vi.fn() }));
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
  m.opportunities.mockResolvedValue([]);
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

it("prefills only an open opportunity owned by the session seller", async () => {
  m.opportunities.mockResolvedValue([{ opportunityId: "opp-a", clientId: "client-a", ownerUserId: "seller-a", stage: "open", title: "Renewal", clientCompany: "Synthetic" }]);
  const page = await QuotesPage({ searchParams: Promise.resolve({ opportunityId: "opp-a" }) });
  expect(page.props.initialOpportunity).toMatchObject({ opportunityId: "opp-a", clientId: "client-a", company: "Synthetic" });
  expect(m.opportunities).toHaveBeenCalledWith("tenant-a", "seller-a", false);
});
it("does not prefill another seller's or a closed opportunity", async () => {
  for (const row of [{ ownerUserId: "seller-b", stage: "open" }, { ownerUserId: "seller-a", stage: "won" }]) {
    m.opportunities.mockResolvedValue([{ ...row, opportunityId: "opp-a", clientId: "client-a" }]);
    const page = await QuotesPage({ searchParams: Promise.resolve({ opportunityId: "opp-a" }) });
    expect(page.props.initialOpportunity).toBeUndefined();
  }
});
