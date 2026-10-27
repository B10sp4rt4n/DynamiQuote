import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/quotes", () => ({ createQuoteForTenant: m.create, QuoteCreationError: class extends Error { constructor(message: string, public status = 422) { super(message); } } }));
vi.mock("@/lib/utils/rate-limit", () => ({ getRequestIdentity: () => "test", enforceRateLimit: () => ({ allowed: true }) }));
import { POST } from "./route";
import { QuoteCreationError } from "@/lib/db/quotes";
const request = (body: unknown) => new Request("http://localhost/api/quotes", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user", isSuperAdmin: false }); m.create.mockResolvedValue({ quoteId: "quote-a" }); });
describe("quote opportunity declaration", () => {
  it("creates a declared new opportunity without requiring CRM intake fields", async () => {
    const response = await POST(request({ clientName: "Synthetic company", opportunityMode: "new", creationId: "3bc17bc9-ae42-4a73-81b7-793e938ea4c6" }));
    expect(response.status).toBe(201); expect(m.create).toHaveBeenCalledWith("tenant-a", expect.objectContaining({ opportunityMode: "new" }), "seller-a", false);
  });
  it("rejects an unselected existing opportunity and incompatible modes", async () => {
    for (const body of [{ opportunityMode: "existing" }, { opportunityMode: "existing", opportunityId: "opp" }, { opportunityMode: "new", opportunityId: "opp" }, { opportunityMode: "invalid" }])
      expect((await POST(request({ clientName: "Synthetic", ...body }))).status).toBe(422);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("does not create with no session or actor, and never trusts a client-supplied tenant/role", async () => {
    m.tenant.mockResolvedValueOnce(null); expect((await POST(request({ clientName: "Synthetic" }))).status).toBe(401);
    m.tenant.mockResolvedValueOnce({ id: "tenant-a", userId: null }); expect((await POST(request({ clientName: "Synthetic" }))).status).toBe(401);
    expect(m.create).not.toHaveBeenCalled();
    await POST(request({ clientName: "Synthetic", tenantId: "foreign", canSeeAll: true }));
    expect(m.create).toHaveBeenCalledWith("tenant-a", { clientName: "Synthetic" }, "seller-a", false);
  });
  it("reports a rejected association without creating a success response", async () => {
    m.create.mockRejectedValueOnce(new QuoteCreationError("Oportunidad no disponible", 404));
    expect((await POST(request({ clientName: "Synthetic", clientId: "client-a", opportunityMode: "existing", opportunityId: "foreign" }))).status).toBe(404);
  });
});
