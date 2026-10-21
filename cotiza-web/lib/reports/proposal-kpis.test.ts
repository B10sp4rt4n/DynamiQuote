import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/proposal-kpis", () => ({
  getProposalKpiSummaryByTenant: vi.fn().mockResolvedValue({}),
  getProposalMarginTimelineByTenant: vi.fn().mockResolvedValue([]),
  getProposalOutcomeTimelineByTenant: vi.fn().mockResolvedValue([]),
  getProposalStatusTimelineByTenant: vi.fn().mockResolvedValue([]),
  getSalesRepRankingByTenant: vi.fn().mockResolvedValue([]),
}));
import * as queries from "@/lib/db/proposal-kpis";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { getProposalKpiReportData } from "./proposal-kpis";

describe("shared KPI report scope", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["superadmin", "owner", "admin", "user"] as const)("keeps %s scoped to the selected tenant and actor", async (userRole) => {
    const tenant = { id: "selected-tenant", name: "Selected", userId: "actor", userRole, isSuperAdmin: userRole === "superadmin" } as TenantContext;
    const result = await getProposalKpiReportData(tenant);
    const canSeeAll = userRole !== "user";
    for (const query of [queries.getProposalKpiSummaryByTenant, queries.getProposalMarginTimelineByTenant, queries.getProposalOutcomeTimelineByTenant, queries.getProposalStatusTimelineByTenant]) {
      expect(query).toHaveBeenCalledExactlyOnceWith("selected-tenant", "actor", canSeeAll);
    }
    expect(result.canSeeAll).toBe(canSeeAll);
    if (canSeeAll) expect(queries.getSalesRepRankingByTenant).toHaveBeenCalledExactlyOnceWith("selected-tenant");
    else { expect(queries.getSalesRepRankingByTenant).not.toHaveBeenCalled(); expect(result.ranking).toEqual([]); }
  });
});
