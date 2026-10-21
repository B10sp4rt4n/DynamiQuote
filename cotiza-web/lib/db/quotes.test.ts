import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mock }));
import { getQuoteDashboardSnapshotByTenant } from "./quotes";

describe("quote dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps monthly money, counts undated quotes only in the global total, and scopes both queries", async () => {
    mock.$queryRaw.mockResolvedValueOnce([
      { month: "2026-01", revenue: new Prisma.Decimal(1000), gross_profit: new Prisma.Decimal(140), quote_count: BigInt(2), missing_margin_count: BigInt(0) },
      { month: null, revenue: new Prisma.Decimal(200), gross_profit: new Prisma.Decimal(-10), quote_count: BigInt(1), missing_margin_count: BigInt(0) },
    ]).mockResolvedValueOnce([]);

    const result = await getQuoteDashboardSnapshotByTenant("tenant-test");
    expect(result).toMatchObject({ activeQuoteCount: 3, totalRevenue: 1200, undatedQuoteCount: 1 });
    expect(result.monthlyKpis).toEqual([{ month: "2026-01", revenue: 1000, grossProfit: 140, quoteCount: 2, missingMarginCount: 0 }]);
    for (const [query] of mock.$queryRaw.mock.calls) {
      expect(query.values).toContain("tenant-test");
    }
  });

  it("returns an empty snapshot for a tenant without quotes", async () => {
    mock.$queryRaw.mockResolvedValue([]);
    expect(await getQuoteDashboardSnapshotByTenant("empty")).toEqual({
      activeQuoteCount: 0, totalRevenue: 0, undatedQuoteCount: 0, monthlyKpis: [], recentQuotes: [],
    });
  });
});
