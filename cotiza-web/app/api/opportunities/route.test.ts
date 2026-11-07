import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), pipeline: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/opportunities", () => ({ getOpportunityPipelineByTenant: m.pipeline }));
vi.mock("@/lib/db/declare-opportunity", () => ({ declareOpportunity: m.create, DeclarationError: class extends Error { constructor(message: string, public status: number) { super(message); } } }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: () => ({ allowed: true }) }));
import { GET, POST } from "./route";
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

const declaration = { creationId: "7edf5943-15fb-40d7-b7b3-48dc5b875159", clientId: "6e2d4f0d-4db4-4b62-a13a-63cbab1916af", title: "Renewal" };
const post = (data: unknown) => new Request("http://localhost/api/opportunities", { method: "POST", body: JSON.stringify(data) });
it("declares with the server actor and tenant only", async () => { m.create.mockResolvedValue({ opportunityId: "own" }); expect((await POST(post(declaration))).status).toBe(201); expect(m.create).toHaveBeenCalledWith("tenant-a", "seller-a", declaration); });
it("rejects absent actor, injected ownership and malformed input before creation", async () => {
  for (const data of [{...declaration,tenantId:"foreign"}, {...declaration,ownerUserId:"other"}, {...declaration,title:" "}, null]) expect((await POST(post(data))).status).toBe(422);
  m.tenant.mockResolvedValue({id:"tenant-a",userId:null}); expect((await POST(post(declaration))).status).toBe(401); expect(m.create).not.toHaveBeenCalled();
});
