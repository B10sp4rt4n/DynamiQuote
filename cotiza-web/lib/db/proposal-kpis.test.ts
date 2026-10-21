import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mock }));
import { getProposalKpiSummaryByTenant, getProposalMarginTimelineByTenant } from "./proposal-kpis";

describe("won revenue queries", () => {
  beforeEach(() => vi.clearAllMocks());
  it("maps won revenue and won costs independently of approved and proposed totals", async () => {
    mock.$queryRaw.mockResolvedValue([{ period: new Date("2026-10-01T00:00:00Z"), won_amount: "200", won_cost: "150", proposed_amount: "100000", proposed_cost: "80000", approved_amount: "50000", approved_cost: "40000" }]);
    const result = await getProposalMarginTimelineByTenant("tenant-a", "seller-a", false);
    expect(result[0]).toMatchObject({ wonAmount: 200, wonProfit: 50, wonMarginPct: 25, proposedAmount: 100000, approvedAmount: 50000 });
    expect(mock.$queryRaw.mock.calls[0][0].values).toContain("tenant-a");
    expect(mock.$queryRaw.mock.calls[0][0].values).toContain("seller-a");
  });
  it("exposes historical won revenue separately from approved totals", async () => {
    mock.$queryRaw.mockResolvedValue([{ won_amount: "266274.94", won_cost: "200000", approved_amount: "9000000", proposed_amount: "15000000" }]);
    const result = await getProposalKpiSummaryByTenant("tenant-a");
    expect(result.wonAmount).toBe(266274.94);
    expect(result.wonProfit).toBeCloseTo(66274.94);
    expect(result.approvedAmount).toBe(9000000);
  });
});
