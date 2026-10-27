import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), cap: vi.fn(), clients: vi.fn(), opportunities: vi.fn(), tasks: vi.fn(), logos: vi.fn(), users: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.cap }));
vi.mock("@/lib/db/clients", () => ({ listClientsByTenant: m.clients }));
vi.mock("@/lib/db/opportunities", () => ({ getOpportunityPipelineByTenant: m.opportunities }));
vi.mock("@/lib/db/tasks", () => ({ getPendingTasksByTenant: m.tasks }));
vi.mock("@/lib/db/settings", () => ({ getIssuerProfilesByTenant: m.logos, getAppUsersByTenant: m.users }));
vi.mock("@/components/crm/crm-workspace", () => ({ CrmWorkspace: () => null }));
import Page from "./page";
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "sys", name: "Sys", userId: "u1", isSuperAdmin: true }); m.cap.mockResolvedValue(true); for (const fn of [m.clients,m.opportunities,m.tasks,m.logos,m.users]) fn.mockResolvedValue([]); });
it.each([null, { id: "sys", userId: "seller", isSuperAdmin: false }, { id: "sys", userId: null, isSuperAdmin: true }])("rejects missing identity or pilot role before data reads: %j", async tenant => {
  m.tenant.mockResolvedValue(tenant); await expect(Page()).rejects.toThrow("404"); expect(m.cap).not.toHaveBeenCalled(); expect(m.clients).not.toHaveBeenCalled(); expect(m.opportunities).not.toHaveBeenCalled(); expect(m.tasks).not.toHaveBeenCalled();
});
it("requires the capability for the current tenant before commercial reads", async () => {
  m.cap.mockResolvedValue(false); await expect(Page()).rejects.toThrow("404"); expect(m.cap).toHaveBeenCalledWith("sys", "crm_workspace_pilot"); expect(m.clients).not.toHaveBeenCalled(); expect(m.users).not.toHaveBeenCalled();
});
it("passes the session tenant to every source and limits logo/user props", async () => {
  m.users.mockResolvedValue([{ active: true, firstName: "User", lastName: "One", userId: "u1", email: "private@test", phone: "private" }]);
  m.logos.mockResolvedValue([{ companyName: "C", logoId: "l1", logoName: "Logo", taxId: "private" }]);
  const view = await Page();
  expect(m.clients).toHaveBeenCalledWith("sys"); expect(m.opportunities).toHaveBeenCalledWith("sys","u1",true); expect(m.tasks).toHaveBeenCalledWith("sys","u1",true); expect(m.logos).toHaveBeenCalledWith("sys","client"); expect(m.users).toHaveBeenCalledWith("sys");
  expect(view.props.vendors).toEqual([{ userId: "u1", label: "User One" }]); expect(view.props.clientLogos).toEqual([{ companyName: "C", logoId: "l1", logoName: "Logo" }]);
});
