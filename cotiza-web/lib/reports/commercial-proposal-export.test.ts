import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommercialSourceRow } from "@/lib/db/commercial-export-source";

const mocks = vi.hoisted(() => ({ context: vi.fn(), enabled: vi.fn(), read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.context }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: mocks.enabled }));
vi.mock("@/lib/db/commercial-export-source", () => ({ readCommercialExportRows: mocks.read }));
import { prepareCommercialProposalExport } from "./commercial-proposal-export";

const request = { startUtc: "2025-01-01T06:00:00.000Z", endUtcExclusive: "2026-01-01T06:00:00.000Z" };
const owner = { id: "tenant-a", userId: "seller-a", userRole: "owner", authMode: "clerk", isSuperAdmin: false };
function row(overrides: Partial<CommercialSourceRow> = {}): CommercialSourceRow {
  return { proposal_id: "p1", tenant_id: "tenant-a", seller_id: "seller-a", origin_quote_id: "q1", opportunity_id: null,
    outcome_at: new Date("2025-08-01T06:00:00Z"), reporting_at: new Date("2025-08-01T06:00:00Z"),
    legacy_act_ref: null, revenue: "0.30", cost: "0.10",
    links: [{ quote_id: "q1", lineage_id: "lineage-1", version: 1, client_id: "client-a", currency: "MXN",
      opportunity_id: null, opportunity_exists: false, opportunity_client_id: null, won_peer_count: 1 }],
    ...overrides };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.context.mockResolvedValue(owner); mocks.enabled.mockResolvedValue(true);
  mocks.read.mockResolvedValue([row()]);
});
describe("commercial proposal export preparation", () => {
  it("exports exact decimal profit and opaque references without claiming a complete sales snapshot", async () => {
    const result = await prepareCommercialProposalExport(request);
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") throw Error("expected payload");
    expect(result.payload.records[0]).toMatchObject({ revenue_before_vat: "0.30", cost: "0.10", gross_profit: "0.20" });
    expect(result.payload).toMatchObject({ coverage: "not_certified", selection: "unique_won_deal_or_unresolved" });
    expect(result.payload.records[0].sale_selection.state).toBe("selected");
    expect(result.digest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.enabled).toHaveBeenCalledWith("tenant-a", "commercial_chat_read");
  });
  it.each([null, { ...owner, authMode: "bootstrap" }, { ...owner, userId: null }])("denies unauthenticated/bootstrap identity before reading", async context => {
    mocks.context.mockResolvedValue(context);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "forbidden" });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("denies a superadmin when capability is absent", async () => {
    mocks.context.mockResolvedValue({ ...owner, isSuperAdmin: true }); mocks.enabled.mockResolvedValue(false);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "forbidden" });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([
    { ...request, tenantId: "other" }, { ...request, includeCosts: true },
    { ...request, startUtc: "2025-02-30T00:00:00.000Z" },
    { ...request, endUtcExclusive: request.startUtc },
    { ...request, startUtc: "2026-02-01T06:00:00.000Z" },
    { ...request, startUtc: "2025-01-01T00:00:00-06:00" },
  ])("rejects identity injection or invalid intervals", async input => {
    expect(await prepareCommercialProposalExport(input)).toEqual({ status: "invalid_request" });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("seller scope excludes unknown owners and redacts costs even if an adapter returns them", async () => {
    mocks.context.mockResolvedValue({ ...owner, userRole: "user" });
    const result = await prepareCommercialProposalExport(request);
    expect(mocks.read).toHaveBeenCalledWith({ tenantId: "tenant-a", userId: "seller-a", allSellers: false, includeCosts: false }, expect.any(Date), expect.any(Date));
    if (result.status !== "prepared") throw Error("expected payload");
    expect(result.payload.records[0]).toMatchObject({ cost: null, gross_profit: null });
    mocks.read.mockResolvedValue([row({ seller_id: null })]);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "invalid_source" });
  });
  it("rejects foreign tenant rows without exposing content", async () => {
    mocks.read.mockResolvedValue([row({ tenant_id: "foreign" })]);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "invalid_source" });
  });
  it.each([null, { ...owner, id: "other" }, { ...owner, userRole: "user" }])("revalidates identity and scope after the read", async second => {
    mocks.context.mockResolvedValueOnce(owner).mockResolvedValueOnce(second);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "forbidden" });
  });
  it("revalidates capability after reading", async () => {
    mocks.enabled.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "forbidden" });
  });
  it("preserves unknown amounts and reports unresolved links/dates", async () => {
    mocks.read.mockResolvedValue([row({ revenue: null, cost: null, reporting_at: null, outcome_at: null, links: [] })]);
    const result = await prepareCommercialProposalExport(request);
    if (result.status !== "prepared") throw Error("expected payload");
    expect(result.payload.records[0]).toMatchObject({ revenue_before_vat: null, cost: null, gross_profit: null,
      issues: ["MISSING_CLOSE_DATE", "MISSING_REVENUE", "MISSING_COST", "UNRESOLVED_SOURCE_LINK"] });
  });
  it("keeps audited legacy dates distinct from observed close dates", async () => {
    mocks.read.mockResolvedValue([row({ outcome_at: null, legacy_act_ref: "legacy-creation-20261021:p1" })]);
    const result = await prepareCommercialProposalExport(request);
    if (result.status !== "prepared") throw Error("expected payload");
    expect(result.payload.records[0].date_basis).toBe("legacy_creation_reference");
  });
  it("preserves alternatives as candidates rather than inventing a winning version", async () => {
    const links = row().links.map(link => ({ ...link, won_peer_count: 2 }));
    mocks.read.mockResolvedValue([row({ links }), row({ proposal_id: "p2", links })]);
    const result = await prepareCommercialProposalExport(request);
    if (result.status !== "prepared") throw Error("expected payload");
    expect(result.payload.records).toHaveLength(2);
    expect(result.payload.records.every(record => record.sale_selection.state === "unresolved")).toBe(true);
  });
  it("rejects duplicate selected sale identities even if source counts contradict the rows", async () => {
    mocks.read.mockResolvedValue([row(), row({ proposal_id: "p2" })]);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "invalid_source" });
  });
  it.each(["NaN", "Infinity", "1.001", "not-a-number"])("rejects incompatible source amounts: %s", async revenue => {
    mocks.read.mockResolvedValue([row({ revenue })]);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "invalid_source" });
  });
  it("does not certify zero sales for an empty candidate set", async () => {
    mocks.read.mockResolvedValue([]);
    const result = await prepareCommercialProposalExport(request);
    expect(result).toMatchObject({ status: "prepared", payload: { records: [], coverage: "not_certified" } });
  });
  it("fails bounded exports instead of silently truncating them", async () => {
    mocks.read.mockResolvedValue(Array.from({ length: 501 }, (_, i) => row({ proposal_id: `p${i}` })));
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "limit_exceeded" });
  });
  it("rejects duplicate proposal references", async () => {
    mocks.read.mockResolvedValue([row(), row()]);
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "invalid_source" });
  });
  it("does not leak database exception details", async () => {
    mocks.read.mockRejectedValue(new Error("postgresql://secret@private"));
    expect(await prepareCommercialProposalExport(request)).toEqual({ status: "source_unavailable" });
  });
});
