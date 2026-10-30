import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), user: vi.fn(), cap: vi.fn(), clients: vi.fn(), opportunities: vi.fn(), tasks: vi.fn(), logos: vi.fn(), users: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findFirst: m.user } } }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.cap }));
vi.mock("@/lib/db/clients", () => ({ listClientsByTenant: m.clients }));
vi.mock("@/lib/db/opportunities", () => ({ getOpportunityPipelineByTenant: m.opportunities }));
vi.mock("@/lib/db/tasks", () => ({ getPendingTasksByTenant: m.tasks }));
vi.mock("@/lib/db/settings", () => ({ getIssuerProfilesByTenant: m.logos, getAppUsersByTenant: m.users }));
vi.mock("@/components/crm/crm-workspace", () => ({ CrmWorkspace: () => null }));
import Page from "./page";
const context = { id: "sys", name: "Sys", userId: "u1", authMode: "clerk", userRole: "superadmin", isSuperAdmin: true };
beforeEach(() => {
  vi.clearAllMocks(); m.tenant.mockResolvedValue(context); m.user.mockResolvedValue({ role: "superadmin", tenant_id: "sys" }); m.cap.mockResolvedValue(true);
  for (const fn of [m.clients,m.opportunities,m.tasks,m.logos,m.users]) fn.mockResolvedValue([]);
});
it.each([null, { ...context, userId: null }, { ...context, authMode: "bootstrap" }])("rejects missing session identity before commercial reads: %j", async tenant => {
  m.tenant.mockResolvedValue(tenant); await expect(Page()).rejects.toThrow("404"); expect(m.cap).not.toHaveBeenCalled(); expect(m.clients).not.toHaveBeenCalled(); expect(m.opportunities).not.toHaveBeenCalled(); expect(m.tasks).not.toHaveBeenCalled();
});
it.each([true, false])("requires current tenant capability for superadmin=%s", async isSuperAdmin => {
  m.tenant.mockResolvedValue({ ...context, isSuperAdmin }); m.cap.mockResolvedValue(false);
  await expect(Page()).rejects.toThrow("404"); expect(m.cap).toHaveBeenCalledWith("sys", "crm_workspace_pilot");
  expect(m.clients).not.toHaveBeenCalled(); expect(m.opportunities).not.toHaveBeenCalled(); expect(m.tasks).not.toHaveBeenCalled(); expect(m.users).not.toHaveBeenCalled();
});
it("gives the seller only own-record scope without fetching the catalog, logos or roster", async () => {
  m.tenant.mockResolvedValue({ ...context, userRole: "user", isSuperAdmin: false }); m.user.mockResolvedValue({ role: "user", tenant_id: "sys" });
  const view = await Page();
  expect(m.opportunities).toHaveBeenCalledWith("sys", "u1", false, false); expect(m.tasks).toHaveBeenCalledWith("sys", "u1", false, false);
  expect(m.clients).not.toHaveBeenCalled(); expect(m.logos).not.toHaveBeenCalled(); expect(m.users).not.toHaveBeenCalled();
  expect(view.props).toMatchObject({ canSeeAll: false, clients: [], clientLogos: [], vendors: [], viewerUserId: "u1" });
});
it("rejects a foreign or inactive application user before commercial reads", async () => {
  for (const user of [null, { role: "user", tenant_id: "foreign" }]) { m.user.mockResolvedValue(user); await expect(Page()).rejects.toThrow("404"); }
  expect(m.opportunities).not.toHaveBeenCalled(); expect(m.tasks).not.toHaveBeenCalled();
});
it("preserves superadmin sources in the session tenant and limits serialized logo/user props", async () => {
  m.users.mockResolvedValue([{ active: true, firstName: "User", lastName: "One", userId: "u1", email: "private@test", phone: "private" }]);
  m.logos.mockResolvedValue([{ companyName: "C", logoId: "l1", logoName: "Logo", taxId: "private" }]);
  const view = await Page();
  expect(m.clients).toHaveBeenCalledWith("sys"); expect(m.opportunities).toHaveBeenCalledWith("sys","u1",true,false); expect(m.tasks).toHaveBeenCalledWith("sys","u1",true,false); expect(m.logos).toHaveBeenCalledWith("sys","client"); expect(m.users).toHaveBeenCalledWith("sys");
  expect(view.props.canSeeAll).toBe(true); expect(view.props.vendors).toEqual([{ userId: "u1", label: "User One" }]); expect(view.props.clientLogos).toEqual([{ companyName: "C", logoId: "l1", logoName: "Logo" }]);
});
