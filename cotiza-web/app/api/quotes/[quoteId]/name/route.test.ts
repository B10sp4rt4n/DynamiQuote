import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), rename: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/quote-name", () => ({ renameQuoteForTenant: m.rename }));
vi.mock("@/lib/utils/rate-limit", () => ({ getRequestIdentity: () => "fixture", enforceRateLimit: () => ({ allowed: true }) }));
import { PATCH } from "./route";
const request = (proposalName: unknown) => PATCH(new Request("http://localhost/api/quotes/q1/name", {
  method: "PATCH", body: JSON.stringify({ proposalName }), headers: { "Content-Type": "application/json" },
}), { params: Promise.resolve({ quoteId: "q1" }) });
beforeEach(() => {
  vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user", isSuperAdmin: false });
  m.rename.mockResolvedValue({ quoteId: "q1", proposalName: "Renovación" });
});
it("requires an authenticated user before writing a name", async () => {
  m.tenant.mockResolvedValue(null); expect((await request("Nombre")).status).toBe(401); expect(m.rename).not.toHaveBeenCalled();
});
it("passes the selected revision and authenticated tenant/user to the writer", async () => {
  const response = await request("  Renovación  ");
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ quote: { quoteId: "q1", proposalName: "Renovación" } });
  expect(m.rename).toHaveBeenCalledExactlyOnceWith("tenant-a", "q1", "seller-a", false, "Renovación");
});
it.each([null, "", "Sin propuesta", "x".repeat(201)])("does not persist an invalid name: %s", async name => {
  expect((await request(name)).status).toBe(422); expect(m.rename).not.toHaveBeenCalled();
});
it("reports an unavailable or non-draft revision without a successful response", async () => {
  m.rename.mockResolvedValue(null); expect((await request("Nombre")).status).toBe(409);
});
it("does not report a name as saved when confirmation fails", async () => {
  m.rename.mockRejectedValue(Error("database unavailable")); const response = await request("Nombre");
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("database unavailable");
});
