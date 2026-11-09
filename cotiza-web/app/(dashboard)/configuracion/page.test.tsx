import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), capability: vi.fn(), mode: vi.fn(), available: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.capability, THREATDOWN_PDF_IMPORT: "threatdown_pdf_import" }));
vi.mock("@/lib/db/tenant-operation", () => ({ getTenantOperationMode: m.mode }));
vi.mock("@/lib/integrations/mercadolibre/availability", () => ({ mercadoLibreEnabled: m.available }));
vi.mock("@/lib/db/margin-policies", () => ({ getMarginPolicyByTenant: async () => ({}) }));
vi.mock("@/lib/db/settings", () => ({ getAppUsersByTenant: async () => [], getAppUsersForSuperAdmin: async () => [], getIssuerProfilesByTenant: async () => [] }));
vi.mock("@/lib/db/tenants", () => ({ getActiveTenants: async () => [], getTenantProfileByTenant: async () => null }));
vi.mock("@/components/configuracion/settings-shell", () => ({ SettingsShell: () => null }));
import SettingsPage from "./page";
beforeEach(() => { vi.resetAllMocks(); m.tenant.mockResolvedValue({ id: "a", name: "A", userRole: "owner", authMode: "clerk", isSuperAdmin: false });
  m.capability.mockResolvedValue(false); m.mode.mockResolvedValue("mixed"); m.available.mockResolvedValue(false); });
it("reads the authenticated tenant profile and keeps the optional channel separate", async () => {
  const page = await SettingsPage();
  expect(page.props).toMatchObject({ operationMode: "mixed", mercadoLibreEntitled: false, mercadoLibreAvailable: false, canManageAllTenants: false });
  expect(m.mode).toHaveBeenCalledWith("a"); expect(m.capability).toHaveBeenCalledWith("a", "mercadolibre_channel");
});
it.each(["owner", "admin"])("lets %s manage a granted channel without granting configuration authority", async userRole => {
  m.tenant.mockResolvedValue({ id: "b", name: "B", userRole, authMode: "clerk", isSuperAdmin: false });
  m.capability.mockImplementation(async (_tenant, key) => key === "mercadolibre_channel"); m.available.mockResolvedValue(true);
  const page = await SettingsPage();
  expect(page.props).toMatchObject({ tenantId: "b", canManageUsers: true, canManageAllTenants: false, mercadoLibreEntitled: true, mercadoLibreAvailable: true });
  expect(m.available).toHaveBeenCalledWith("b");
});
it("does not expose operation or channel configuration to a regular user", async () => {
  m.tenant.mockResolvedValue({ id: "a", userRole: "user", authMode: "clerk", isSuperAdmin: false });
  const page = await SettingsPage();
  expect(page.props).toMatchObject({ canManageUsers: false, operationMode: "consultative", mercadoLibreEntitled: false, mercadoLibreAvailable: false });
  expect(m.mode).not.toHaveBeenCalled(); expect(m.available).not.toHaveBeenCalled();
  expect(m.capability).not.toHaveBeenCalledWith("a", "mercadolibre_channel");
});
