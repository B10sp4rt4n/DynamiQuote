import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/opportunity-intake", () => ({ getOpportunityIntake: m.get, saveOpportunityIntake: m.save }));
vi.mock("@/lib/utils/rate-limit", () => ({ getRequestIdentity: () => "test", enforceRateLimit: () => ({ allowed: true }) }));
import { GET, PATCH } from "./route";
const context = () => ({ params: Promise.resolve({ opportunityId: "opp-a" }) });
const request = (body: unknown) => new Request("http://localhost/api/opportunities/opp-a/intake", { method: "PATCH", body: JSON.stringify(body) });
const fields = { title: "", need: "", source: "", nextStep: "", revision: 0 };
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user", isSuperAdmin: false }); m.save.mockResolvedValue("updated"); m.get.mockResolvedValue({ opportunityId: "opp-a", missingFields: ["Nombre de oportunidad", "Necesidad", "Origen"] }); });
describe("opportunity intake API", () => {
  it("authenticates before reads or writes, including sessions without an actor", async () => {
    for (const tenant of [null, { id: "tenant-a", userId: null }]) {
      m.tenant.mockResolvedValue(tenant);
      expect((await GET(new Request("http://localhost"), context())).status).toBe(401);
      expect((await PATCH(request(fields), context())).status).toBe(401);
    }
    expect(m.get).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
  });
  it("allows partial saves while taking tenant and seller permissions from the session", async () => {
    const response = await PATCH(request(fields), context());
    expect(response.status).toBe(200);
    expect(m.save).toHaveBeenCalledWith("tenant-a", "opp-a", { userId: "seller-a", canSeeAll: false }, fields);
    expect((await response.json()).opportunity.missingFields).toHaveLength(3);
  });
  it("rejects injected tenant/actor fields and invalid input before writing", async () => {
    for (const body of [{ ...fields, tenantId: "foreign" }, { ...fields, userId: "owner" }, { ...fields, revision: -1 }, { ...fields, need: "x".repeat(2001) }]) {
      expect((await PATCH(request(body), context())).status).toBe(422);
    }
    expect(m.save).not.toHaveBeenCalled();
  });
  it("returns conflicts and unavailable opportunities without pretending the save succeeded", async () => {
    m.save.mockResolvedValueOnce("conflict"); expect((await PATCH(request(fields), context())).status).toBe(409);
    m.save.mockResolvedValueOnce("not_found"); expect((await PATCH(request(fields), context())).status).toBe(404);
    m.get.mockResolvedValueOnce(null); expect((await GET(new Request("http://localhost"), context())).status).toBe(404);
  });
});
