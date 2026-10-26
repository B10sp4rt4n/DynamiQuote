import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn(), mark: vi.fn(), audit: vi.fn(), changeStatus: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: async (run: (tx: unknown) => unknown) => run({
  $queryRaw: m.query, proposals: { findFirst: m.read, update: m.changeStatus },
  formal_proposals: { updateMany: m.mark }, proposal_audit_events: { create: m.audit },
}) } }));
import { recordProposalDeliveryByTenant } from "./proposal-delivery";
const input = { tenantId: "tenant-a", proposalId: "proposal", documentId: "revision-one", expectedUpdatedAt: "2026-10-26T12:00:00.000Z", actorUserId: "seller", providerId: "synthetic", pdfSha256: "a".repeat(64) };
describe("delivery metadata preserves authorization", () => {
  beforeEach(() => { vi.resetAllMocks(); m.read.mockResolvedValue({ status: "approved" }); m.mark.mockResolvedValue({ count: 1 }); });
  it("records an accepted dispatch against the exact authorized revision without changing status", async () => {
    expect(await recordProposalDeliveryByTenant(input)).toMatchObject({ recordedForCurrentRevision: true, sentAt: expect.any(String) });
    expect(m.mark.mock.calls[0][0].where).toMatchObject({ tenant_id: "tenant-a", proposal_id: "proposal", proposal_doc_id: "revision-one", status: "approved", updated_at: new Date(input.expectedUpdatedAt) });
    expect(Object.keys(m.mark.mock.calls[0][0].data)).toEqual(["sent_at"]);
    expect(m.changeStatus).not.toHaveBeenCalled();
    expect(JSON.parse(m.audit.mock.calls[0][0].data.payload)).toMatchObject({ authorizationAtDispatch: "approved", providerAccepted: true, recipientScope: "seller_and_owner" });
  });
  it("keeps historical evidence without marking a revised or reopened document as sent", async () => {
    m.read.mockResolvedValue({ status: "draft" });
    expect(await recordProposalDeliveryByTenant(input)).toEqual({ sentAt: null, recordedForCurrentRevision: false });
    expect(m.mark).not.toHaveBeenCalled(); expect(m.audit).toHaveBeenCalledOnce(); expect(m.changeStatus).not.toHaveBeenCalled();
  });
  it("does not attribute delivery to a changed revision", async () => {
    m.mark.mockResolvedValue({ count: 0 });
    expect(await recordProposalDeliveryByTenant(input)).toEqual({ sentAt: null, recordedForCurrentRevision: false });
  });
  it("does not write to a foreign tenant", async () => {
    m.read.mockResolvedValue(null);
    await expect(recordProposalDeliveryByTenant(input)).rejects.toThrow("no encontrada");
    expect(m.mark).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
});
