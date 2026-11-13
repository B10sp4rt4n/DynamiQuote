import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), save: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/won-consolidation", () => ({ saveWinPolicy: m.save, getWinPolicy: m.read, WinError: class extends Error { status = 409; } }));
import { PUT } from "./route";
const owner = { id: "a", userId: "owner", userRole: "owner", isSuperAdmin: false, authMode: "clerk" };
function request(headers = {}) { return new Request("https://cotiza.test/api/settings/win-policy", { method: "PUT", headers: { origin: "https://cotiza.test", "X-Tenant-Context": "a", ...headers }, body: JSON.stringify({ expectedRevision: 0, policy: { rules: [] } }) }); }
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue(owner); m.save.mockResolvedValue({ rules: [], revision: 1 }); });
it("restricts policy ownership even when a non-owner can manage other CRM operations", async () => {
  for (const role of ["user", "admin"]) { m.tenant.mockResolvedValue({ ...owner, userRole: role }); expect((await PUT(request())).status).toBe(403); }
  expect(m.save).not.toHaveBeenCalled();
});
it("binds the write to its origin, captured tenant and optimistic revision", async () => {
  expect((await PUT(request({ origin: "https://other.test" }))).status).toBe(403);
  expect((await PUT(request({ "X-Tenant-Context": "b" }))).status).toBe(409);
  expect(m.save).not.toHaveBeenCalled();
  expect((await PUT(request())).status).toBe(200);
  expect(m.save).toHaveBeenCalledWith("a", expect.objectContaining({ userId: "owner" }), { rules: [] }, 0);
});
