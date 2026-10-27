import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), quote: vi.fn(), intake: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { quote: { findFirst: m.quote } } }));
vi.mock("@/lib/db/opportunity-intake", () => ({ getOpportunityIntake: m.intake }));
import { GET } from "./route";
const context = () => ({ params: Promise.resolve({ quoteId: "quote-a" }) });
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user", isSuperAdmin: false }); m.quote.mockResolvedValue({ opportunity_id: "opp-a" }); m.intake.mockResolvedValue({ opportunityId: "opp-a" }); });
it("scopes both the quote and its opportunity to the session before exposing intake", async () => {
  expect((await GET(new Request("http://localhost"), context())).status).toBe(200);
  expect(m.quote).toHaveBeenCalledWith({ where: { tenantId: "tenant-a", quote_id: "quote-a", created_by_user_id: "seller-a" }, select: { opportunity_id: true } });
  expect(m.intake).toHaveBeenCalledWith("tenant-a", "opp-a", { userId: "seller-a", canSeeAll: false });
});
it("does not resolve an opportunity for an invisible quote or unauthenticated user", async () => {
  m.quote.mockResolvedValue(null); expect((await GET(new Request("http://localhost"), context())).status).toBe(404); expect(m.intake).not.toHaveBeenCalled();
  m.tenant.mockResolvedValue(null); expect((await GET(new Request("http://localhost"), context())).status).toBe(401); expect(m.quote).toHaveBeenCalledTimes(1);
});
