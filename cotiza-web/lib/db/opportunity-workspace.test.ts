import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ pipeline: vi.fn(), options: vi.fn(), opportunities: vi.fn(), quotes: vi.fn(), proposals: vi.fn(), tasks: vi.fn(), owner: vi.fn(), quote: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { opportunities: { findMany: m.opportunities }, quote: { findMany: m.quotes, findFirst: m.quote },
  proposals: { findMany: m.proposals }, tasks: { findMany: m.tasks }, app_users: { findFirst: m.owner } } }));
vi.mock("./opportunities", () => ({ getOpportunityPipelineByTenant: m.pipeline }));
vi.mock("./commercial-options", () => ({ getCommercialOptionSets: m.options }));
import { getBusinessWorkspace, getDocumentBusinessContext } from "./opportunity-workspace";

beforeEach(() => {
  vi.clearAllMocks();
  m.pipeline.mockResolvedValue([{ opportunityId: "opp-a", opportunityNumber: "OPP-0066", title: "Test", ownerUserId: "seller-a", clientId: "client-a", stage: "won" }]);
  m.opportunities.mockResolvedValue([{ opportunity_id: "opp-a", client_id: "client-a" }]); m.options.mockResolvedValue([]);
  m.quotes.mockResolvedValue([{ quote_id: "quote-a" }]); m.proposals.mockResolvedValue([]); m.tasks.mockResolvedValue([]); m.owner.mockResolvedValue(null);
  m.quote.mockResolvedValue({ opportunity_id: "opp-a" });
});
it("reads invoice evidence and currency within the same tenant and seller scope", async () => {
  await getBusinessWorkspace("tenant-a", "opp-a", { userId: "seller-a", canSeeAll: false });
  expect(m.proposals).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ tenant_id: "tenant-a", AND: [{ OR: [{ created_by_user_id: "seller-a" }, { created_by_user_id: null }] }] }),
    select: expect.objectContaining({ invoice_status: true, invoice_uuid: true, invoice_draft_id: true, invoice_stamped_at: true,
      formal_proposals: expect.objectContaining({ where: { tenant_id: "tenant-a" }, select: expect.objectContaining({ currency: true }) }) }),
  }));
});
it("returns the actual business result with the document navigation context", async () => {
  const result = await getDocumentBusinessContext("tenant-a", "quote", "quote-a", { userId: "seller-a", canSeeAll: false });
  expect(result).toMatchObject({ stage: "won", opportunityId: "opp-a", quoteId: "quote-a" });
  expect(m.quote).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-a", quote_id: "quote-a", created_by_user_id: "seller-a" } }));
});
it("does not request invoice data when the opportunity is unavailable to the viewer", async () => {
  m.pipeline.mockResolvedValue([]);
  expect(await getBusinessWorkspace("tenant-b", "opp-a", { userId: "seller-b", canSeeAll: false })).toBeNull();
  expect(m.proposals).not.toHaveBeenCalled();
});
