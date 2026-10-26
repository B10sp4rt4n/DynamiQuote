import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ findFirst: vi.fn(), count: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { quote: m } }));
import { getQuoteVersionSummaryByTenant } from "./quotes";

beforeEach(() => {
  vi.clearAllMocks();
  m.findFirst.mockResolvedValue({ quote_id: "COT-0066-v2", quote_group_id: "COT-0066", version: 2,
    avg_margin: { toNumber: () => 18.57 }, total_revenue: { toNumber: () => 302600 },
    client_name: "Cliente de prueba", createdAt: new Date("2026-10-26T12:00:00Z"),
    playbook_name: null, proposal_name: "Escenario de prueba", status: "draft" });
  m.count.mockResolvedValue(4);
});
describe("exact quote version summary for server navigation", () => {
  it("returns the requested v2 with the full group's version count, not the latest v4", async () => {
    expect(await getQuoteVersionSummaryByTenant("tenant-a", "COT-0066-v2", "seller-a", false)).toMatchObject({
      quoteId: "COT-0066-v2", version: 2, versionCount: 4, totalRevenue: 302600, avgMargin: 18.57,
    });
    expect(m.findFirst.mock.calls[0][0].where).toEqual({ quote_id: "COT-0066-v2", tenantId: "tenant-a",
      OR: [{ created_by_user_id: "seller-a" }, { created_by_user_id: null }] });
    expect(m.count).toHaveBeenCalledWith({ where: { tenantId: "tenant-a", quote_group_id: "COT-0066" } });
  });
  it("keeps the tenant boundary for an administrator", async () => {
    await getQuoteVersionSummaryByTenant("tenant-a", "COT-0066-v2", "owner-a", true);
    expect(m.findFirst.mock.calls[0][0].where).toEqual({ quote_id: "COT-0066-v2", tenantId: "tenant-a" });
  });
  it("returns no metadata or group count for a missing, foreign-tenant or invisible version", async () => {
    m.findFirst.mockResolvedValue(null);
    expect(await getQuoteVersionSummaryByTenant("tenant-a", "foreign", "seller-a", false)).toBeNull();
    expect(m.count).not.toHaveBeenCalled();
  });
});
