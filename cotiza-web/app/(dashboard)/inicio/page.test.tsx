import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/inicio/inicio-shell", () => ({ InicioShell: () => null }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: vi.fn() }));
vi.mock("@/lib/db/settings", () => ({ getAppUsersByTenant: vi.fn(), getAppUsersForSuperAdmin: vi.fn(), getIssuerProfilesByTenant: vi.fn() }));
vi.mock("@/lib/db/margin-policies", () => ({ getMarginPolicyByTenant: vi.fn() }));
vi.mock("@/lib/db/proposal-alerts", () => ({ getExpiringProposalsByTenant: vi.fn() }));
vi.mock("@/lib/db/proposal-kpis", () => ({ getProposalKpiSummaryByTenant: vi.fn(), getSalesRepRankingByTenant: vi.fn() }));
vi.mock("@/lib/db/proposals", () => ({ getProposalMarginBlockedCountByTenant: vi.fn(), getProposalOutcomeCountsByTenant: vi.fn(), getProposalStatusCountsByTenant: vi.fn(), getProposalSummariesByTenant: vi.fn() }));
vi.mock("@/lib/db/quotes", () => ({ getQuoteDashboardSnapshotByTenant: vi.fn() }));
vi.mock("@/lib/db/tasks", () => ({ getPendingTasksByTenant: vi.fn() }));
vi.mock("@/lib/db/tenants", () => ({ getTenantProfileByTenant: vi.fn() }));
import InicioPage from "./page";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getAppUsersByTenant, getAppUsersForSuperAdmin } from "@/lib/db/settings";
describe("Inicio user scope", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["synappssys", "another-tenant"])("scopes superadmin to selected tenant %s", async (id) => {
    vi.mocked(getCurrentTenantContext).mockResolvedValue({ id, name: id, isSuperAdmin: true, userRole: "superadmin", userId: "actor" } as Awaited<ReturnType<typeof getCurrentTenantContext>>);
    const users = [{ userId: "local-user", tenantId: id, active: true }] as Awaited<ReturnType<typeof getAppUsersByTenant>>;
    vi.mocked(getAppUsersByTenant).mockResolvedValue(users);
    vi.mocked(getAppUsersForSuperAdmin).mockResolvedValue(Array(9).fill({ active: true }));
    const page = await InicioPage();
    expect(getAppUsersByTenant).toHaveBeenCalledExactlyOnceWith(id);
    expect(getAppUsersForSuperAdmin).not.toHaveBeenCalled();
    expect(page.props.users).toEqual(users);
  });
  it("does not fetch the roster for an ordinary user", async () => {
    vi.mocked(getCurrentTenantContext).mockResolvedValue({ id: "synappssys", isSuperAdmin: false, userRole: "user", userId: "seller" } as Awaited<ReturnType<typeof getCurrentTenantContext>>);
    const page = await InicioPage();
    expect(getAppUsersByTenant).not.toHaveBeenCalled();
    expect(getAppUsersForSuperAdmin).not.toHaveBeenCalled();
    expect(page.props.users).toEqual([]);
  });
});
