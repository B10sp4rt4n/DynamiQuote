import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), pipeline: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/opportunities", () => ({ getOpportunityPipelineByTenant: m.pipeline }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user", isSuperAdmin: false }); });
it("offers only open opportunities of the selected client owned by the seller", async () => {
  const row = { opportunityId: "own", opportunityNumber: "OPP-1", title: "Own sale", clientId: "client-a", stage: "open", ownerUserId: "seller-a" };
  m.pipeline.mockResolvedValue([row, { ...row, opportunityId: "other-client", clientId: "client-b" }, { ...row, opportunityId: "won", stage: "won" }, { ...row, opportunityId: "other-owner", ownerUserId: "other" }, { ...row, opportunityId: "orphan", ownerUserId: null }]);
  const result = await GET(new Request("http://localhost/api/opportunities?clientId=client-a"));
  expect((await result.json()).opportunities).toEqual([{ opportunityId: "own", opportunityNumber: "OPP-1", title: "Own sale" }]);
  expect(m.pipeline).toHaveBeenCalledWith("tenant-a", "seller-a", false);
});
it("does not query opportunities without a session or client selection", async () => {
  expect((await GET(new Request("http://localhost/api/opportunities"))).status).toBe(200); expect(m.pipeline).not.toHaveBeenCalled();
  m.tenant.mockResolvedValue(null); expect((await GET(new Request("http://localhost/api/opportunities?clientId=a"))).status).toBe(401); expect(m.pipeline).not.toHaveBeenCalled();
});
