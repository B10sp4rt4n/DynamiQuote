import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), save: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/opportunity-disposition", () => ({ setOpportunityDisposition: m.save }));
vi.mock("@/lib/utils/rate-limit", () => ({ getRequestIdentity: () => "fixture", enforceRateLimit: m.rate }));
import { PATCH } from "./route";
const request = (data: unknown) => new Request("http://localhost/api/opportunities/a/disposition", { method: "PATCH", body: JSON.stringify(data) });
const ctx = () => ({ params: Promise.resolve({ opportunityId: "a" }) });
const data = { state: "no_decision", reason: "Proyecto no autorizado", revision: 0 };
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant", userId: "seller", userRole: "user" }); m.rate.mockReturnValue({ allowed: true }); m.save.mockResolvedValue("updated"); });
it("requires identified session and derives scope from it", async () => {
  m.tenant.mockResolvedValueOnce(null); expect((await PATCH(request(data), ctx())).status).toBe(401);
  expect(m.save).not.toHaveBeenCalled();
  expect((await PATCH(request(data), ctx())).status).toBe(200);
  expect(m.save).toHaveBeenCalledWith("tenant", "a", { userId: "seller", canSeeAll: false }, data);
});
it("rejects actor injection, invalid states, missing reasons and pauses without dates", async () => {
  for (const body of [{ ...data, tenantId: "foreign" }, { ...data, state: "won" }, { ...data, reason: " " }, { ...data, state: "paused" }])
    expect((await PATCH(request(body), ctx())).status).toBe(422);
  expect(m.save).not.toHaveBeenCalled();
});
it("reports stale changes, protected outcomes and unavailable records", async () => {
  for (const result of ["conflict", "decided", "client_required"]) { m.save.mockResolvedValueOnce(result); expect((await PATCH(request(data), ctx())).status).toBe(409); }
  m.save.mockResolvedValueOnce("not_found"); expect((await PATCH(request(data), ctx())).status).toBe(404);
});
it("rate limits before writing", async () => { m.rate.mockReturnValue({ allowed: false }); expect((await PATCH(request(data), ctx())).status).toBe(429); expect(m.save).not.toHaveBeenCalled(); });
