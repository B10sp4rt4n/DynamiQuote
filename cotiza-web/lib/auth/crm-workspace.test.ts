import { beforeEach, expect, it, vi } from "vitest";
import type { TenantContext } from "./tenant-context";
const m = vi.hoisted(() => ({ user: vi.fn(), capability: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findFirst: m.user } } }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.capability }));
import { getCrmWorkspaceAccess } from "./crm-workspace";
const seller = { id: "tenant-a", userId: "seller", authMode: "clerk", isSuperAdmin: false, userRole: "user" } as TenantContext;
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ role: "user", tenant_id: "tenant-a" }); m.capability.mockResolvedValue(true); });
it.each([null, { ...seller, userId: null }, { ...seller, authMode: "bootstrap" }])("denies missing Clerk identity without reading user or capability: %j", async tenant => {
  expect(await getCrmWorkspaceAccess(tenant as TenantContext | null)).toBeNull(); expect(m.user).not.toHaveBeenCalled(); expect(m.capability).not.toHaveBeenCalled();
});
it("requires an active exact linkage and capability in the session tenant", async () => {
  expect(await getCrmWorkspaceAccess(seller)).toEqual({ userId: "seller", canSeeAll: false });
  expect(m.user).toHaveBeenCalledWith({ where: { user_id: "seller", active: true }, select: { role: true, tenant_id: true } });
  expect(m.capability).toHaveBeenCalledWith("tenant-a", "crm_workspace_pilot");
});
it("denies unlinked or inactive users before capability reads", async () => {
  m.user.mockResolvedValue(null); expect(await getCrmWorkspaceAccess(seller)).toBeNull(); expect(m.capability).not.toHaveBeenCalled();
});
it("denies a foreign tenant even if claims suggest administrative privileges", async () => {
  m.user.mockResolvedValue({ role: "user", tenant_id: "tenant-b" });
  expect(await getCrmWorkspaceAccess({ ...seller, isSuperAdmin: true })).toBeNull(); expect(m.capability).not.toHaveBeenCalled();
});
it.each(["user", "owner", "admin"])("keeps %s scoped to its own records", async role => {
  m.user.mockResolvedValue({ role, tenant_id: "tenant-a" });
  expect(await getCrmWorkspaceAccess({ ...seller, userRole: role as TenantContext["userRole"] })).toEqual({ userId: "seller", canSeeAll: false });
});
it("preserves superadmin view only with a matching application role and session tenant capability", async () => {
  m.user.mockResolvedValue({ role: "superadmin", tenant_id: "another-tenant" });
  const context = { ...seller, isSuperAdmin: true, userRole: "superadmin" as const };
  expect(await getCrmWorkspaceAccess(context)).toEqual({ userId: "seller", canSeeAll: true });
  m.capability.mockResolvedValue(false); expect(await getCrmWorkspaceAccess(context)).toBeNull(); expect(m.capability).toHaveBeenLastCalledWith("tenant-a", "crm_workspace_pilot");
});
it("denies the seller when its tenant capability is off", async () => {
  m.capability.mockResolvedValue(false); expect(await getCrmWorkspaceAccess(seller)).toBeNull();
});
