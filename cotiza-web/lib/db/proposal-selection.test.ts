import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ findMany: vi.fn(), policy: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { proposals: { findMany: m.findMany } } }));
vi.mock("@/lib/db/margin-policies", () => ({ getMarginPolicyByTenant: m.policy }));
import { getProposalSummaryByTenant } from "./proposals";

beforeEach(() => { vi.resetAllMocks(); m.findMany.mockResolvedValue([]); });

it("queries the exact identity within the current tenant and seller scope", async () => {
  expect(await getProposalSummaryByTenant("tenant-a", "older", "seller-a", false)).toBeNull();
  expect(m.findMany.mock.calls[0][0]).toMatchObject({
    take: 1,
    where: { proposal_id: "older", tenant_id: "tenant-a", OR: [{ created_by_user_id: "seller-a" }, { created_by_user_id: null }] },
  });
  expect(m.policy).not.toHaveBeenCalled();
});

it("keeps the tenant and proposal scope for an administrator", async () => {
  await getProposalSummaryByTenant("tenant-b", "older", "admin-b", true);
  expect(m.findMany.mock.calls[0][0].where).toEqual({ proposal_id: "older", tenant_id: "tenant-b" });
});

it("maps the selected proposal without applying list status, outcome or pagination filters", async () => {
  m.policy.mockResolvedValue(null);
  m.findMany.mockResolvedValue([{ proposal_id: "older", created_at: new Date("2026-10-01T00:00:00Z"),
    formal_proposals: [], proposal_items: [], origin: "old-quote", status: "approved" }]);
  expect(await getProposalSummaryByTenant("tenant-a", "older", "seller-a", false)).toMatchObject({
    proposalId: "older", status: "approved", origin: "old-quote",
  });
  const query = m.findMany.mock.calls[0][0];
  expect(query).not.toHaveProperty("skip");
  expect(query.where).not.toHaveProperty("AND");
  expect(query.where).not.toHaveProperty("status");
});
