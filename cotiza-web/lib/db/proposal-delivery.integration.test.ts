import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const testUrl = process.env.COTIZA_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
let db: typeof import("./prisma").prisma;
let delivery: typeof import("./proposal-delivery");
let proposals: typeof import("./proposals");
suite("production-compatible delivery persistence in disposable PostgreSQL", () => {
  beforeAll(async () => {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(testUrl!).hostname)) throw new Error("Disposable loopback database required");
    process.env.DATABASE_URL = testUrl;
    db = (await import("./prisma")).prisma;
    delivery = await import("./proposal-delivery"); proposals = await import("./proposals");
    await db.tenant.create({ data: { tenant_id: "delivery-tenant", name: "Synthetic delivery", slug: "synthetic-delivery", created_at: new Date() } });
    await db.proposals.create({ data: { proposal_id: "delivery-proposal", created_by: "synthetic", tenant_id: "delivery-tenant", status: "approved", created_at: new Date() } });
    await db.formal_proposals.create({ data: { proposal_doc_id: "delivery-doc", proposal_id: "delivery-proposal", tenant_id: "delivery-tenant", proposal_number: "SYNTHETIC-DELIVERY", status: "approved", created_at: new Date(), updated_at: new Date("2026-10-26T12:00:00Z"), issued_date: new Date(), issuer_company: "Synthetic", recipient_company: "Synthetic client" } });
    await proposals.getProposalWorkflowByTenant("delivery-tenant", "delivery-proposal");
  }, 30_000);
  afterAll(async () => { if (db) await db.$disconnect(); });
  const input = { tenantId: "delivery-tenant", proposalId: "delivery-proposal", documentId: "delivery-doc", expectedUpdatedAt: "2026-10-26T12:00:00.000Z", actorUserId: null, providerId: "mock-provider", pdfSha256: "a".repeat(64), recipientScope: "customer_owner_and_emitter" as const, recipients: { to: ["client@example.test"], cc: ["owner@example.test", "emitter@example.test"] } };
  it("requires the exact tenant and revision", async () => {
    expect(await delivery.isProposalDeliveryAuthorizedByTenant(input)).toBe(true);
    expect(await delivery.isProposalDeliveryAuthorizedByTenant({ ...input, tenantId: "foreign" })).toBe(false);
    expect(await delivery.isProposalDeliveryAuthorizedByTenant({ ...input, expectedUpdatedAt: null })).toBe(false);
  });
  it("records actual routing without changing authorization, readable after reload", async () => {
    const result = await delivery.recordProposalDeliveryByTenant(input);
    expect(result.recordedForCurrentRevision).toBe(true);
    const detail = await proposals.getProposalWorkflowByTenant(input.tenantId, input.proposalId);
    expect(detail?.status).toBe("approved");expect(detail?.formal?.sentAt).toBe(result.sentAt);
    expect(detail?.formal?.updatedAt).toBe(input.expectedUpdatedAt);
    const event = await db.proposal_audit_events.findFirstOrThrow({ where: { proposal_id: input.proposalId, event_type: "document_issued" } });
    expect(JSON.parse(event.payload!)).toMatchObject({ recipientScope: input.recipientScope, recipients: input.recipients });
    expect(await db.proposal_approvals.count({ where: { proposal_id: input.proposalId } })).toBe(0);
  });
  it("preserves historical evidence but does not mark a newer revision", async () => {
    await db.formal_proposals.update({ where: { proposal_doc_id: input.documentId }, data: { sent_at: null, updated_at: new Date("2026-10-26T13:00:00Z") } });
    expect(await delivery.recordProposalDeliveryByTenant(input)).toEqual({ sentAt: null, recordedForCurrentRevision: false });
    expect((await db.formal_proposals.findUniqueOrThrow({ where: { proposal_doc_id: input.documentId } })).sent_at).toBeNull();
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: input.proposalId } })).status).toBe("approved");
  });
});
