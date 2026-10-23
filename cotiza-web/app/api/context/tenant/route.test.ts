import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ context: vi.fn(), tenant: vi.fn(), user: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.context }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { tenant: { findFirst: m.tenant }, app_users: { findUnique: m.user } } }));
vi.mock("@/lib/db/tenant-context-audit", () => ({ recordTenantContextChange: m.audit }));
import { POST, DELETE } from "./route";
const request = (body: unknown = { slug: "b" }) => new Request("https://cotiza.test/api/context/tenant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
describe("tenant selection", () => {
  beforeEach(() => {
    vi.resetAllMocks(); m.context.mockResolvedValue({ id: "a", userId: "superadmin", isSuperAdmin: true });
    m.tenant.mockResolvedValue({ tenant_id: "b", slug: "b" }); m.user.mockResolvedValue({ tenant_id: "home" });
  });
  it("requires authentication for select and reset", async () => {
    m.context.mockResolvedValue(null); expect((await POST(request())).status).toBe(401); expect((await DELETE()).status).toBe(401); expect(m.audit).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin", "user"])("forbids %s for select and reset", async (role) => {
    m.context.mockResolvedValue({ id: "a", userId: "u", userRole: role, isSuperAdmin: false });
    expect((await POST(request())).status).toBe(403); expect((await DELETE()).status).toBe(403); expect(m.audit).not.toHaveBeenCalled();
  });
  it.each([null, { slug: 1 }, {}, { slug: " " }])("rejects invalid input %j", async (body) => { expect((await POST(request(body))).status).toBe(422); expect(m.audit).not.toHaveBeenCalled(); });
  it("rejects unavailable target tenant", async () => { m.tenant.mockResolvedValue(null); expect((await POST(request())).status).toBe(404); expect(m.audit).not.toHaveBeenCalled(); });
  it("records actor and both tenants before setting cookie", async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(m.audit).toHaveBeenCalledWith("superadmin", "a", "b"); expect(response.cookies.get("tenant_override_slug")?.value).toBe("b");
  });
  it("fails closed when audit fails", async () => { m.audit.mockRejectedValue(new Error("DB failure")); await expect(POST(request())).rejects.toThrow("DB failure"); });
  it("audits reset to the registered home tenant", async () => {
    m.tenant.mockResolvedValue({ tenant_id: "home" }); const response = await DELETE();
    expect(response.status).toBe(200); expect(m.audit).toHaveBeenCalledWith("superadmin", "a", "home");
    expect(m.tenant).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: "home", active: true } }));
  });
});
