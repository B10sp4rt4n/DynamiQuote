import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn(), proposal: vi.fn(), visible: vi.fn(), send: vi.fn(), delivery: vi.fn(), audit: vi.fn(), pdf: vi.fn(), authorized: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/proposals", () => ({ getProposalWorkflowByTenant: m.proposal, isProposalVisibleToViewer: m.visible }));
vi.mock("@/lib/db/proposal-delivery", () => ({ recordProposalDeliveryByTenant: m.delivery, isProposalDeliveryAuthorizedByTenant: m.authorized }));
vi.mock("@/lib/db/proposal-audit", () => ({ recordProposalAuditEvent: m.audit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([]), app_users: { findFirst: m.user } } }));
vi.mock("@/lib/db/tenants", () => ({ getTenantProfileByTenant: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/email/resend", () => ({ resolveResendConfig: async () => ({ client: { emails: { send: m.send } }, from: "test@example.test" }) }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: () => ({ allowed: true }), getRequestIdentity: () => "synthetic" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ sessionClaims: { email: "seller@example.test" }, userId: "seller" }), clerkClient: vi.fn() }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: m.pdf }));
vi.mock("@/lib/pdf/proposal-document", () => ({ ProposalPdfDocument: () => ({}) }));
import { POST } from "./route";
const fixture = { proposalId: "p1", status: "approved", issuanceStatus: "normal", marginEvaluation: { canAuthorizeFinal: true },
  formal: { proposalDocId: "document", updatedAt: "2026-10-26T12:00:00.000Z", issuerEmail: "seller@example.test", proposalNumber: "SYNTHETIC", recipientCompany: "Synthetic" } };
const context = { params: Promise.resolve({ proposalId: "p1" }) };
const req = (body: unknown = {}) => new Request("https://cotiza.test/api/proposals/p1/send-email", { method: "POST", body: JSON.stringify(body) });
describe("authorization before email dispatch; provider always simulated", () => {
  beforeEach(() => {
    vi.resetAllMocks(); m.tenant.mockResolvedValue({ id: "tenant", userId: "seller", userRole: "user", name: "Synthetic", isSuperAdmin: false });
    m.user.mockImplementation(async ({ where }) => where.role === "owner" ? { user_id: "owner", email: "owner@example.test" } : { email: "seller@example.test" });
    m.authorized.mockResolvedValue(true);m.visible.mockResolvedValue(true);m.proposal.mockResolvedValue(structuredClone(fixture));
    m.send.mockResolvedValue({ data: { id: "synthetic-provider" }, error: null });
    m.pdf.mockResolvedValue(Buffer.from("synthetic pdf"));m.delivery.mockResolvedValue({ sentAt: "2026-10-26T12:01:00Z", recordedForCurrentRevision: true });
  });
  it.each(["draft", "in_review", "sent", "rejected", "expired"])("blocks %s even with eligible margin and PDF override", async status => {
    m.proposal.mockResolvedValue({ ...fixture, status, issuanceStatus: "force_pending" });
    expect((await POST(req(), context)).status).toBe(403);expect(m.send).not.toHaveBeenCalled();expect(m.delivery).not.toHaveBeenCalled();
  });
  it("records delivery independently and does not return a replacement authorization status", async () => {
    const response = await POST(req(), context); const data = await response.json();
    expect(response.status).toBe(200);expect(data.sentAt).toBe("2026-10-26T12:01:00Z");expect(data.status).toBeUndefined();
    expect(m.send).toHaveBeenCalledOnce();expect(m.delivery).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant", proposalId: "p1", documentId: "document", pdfSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });
  it("defaults to internal delivery and ignores supplied destination addresses", async () => {
    await POST(req({ to: "outsider@example.test", recipientEmail: "outsider@example.test" }), context);
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: ["seller@example.test"], cc: ["owner@example.test"] }));
    expect(m.delivery).toHaveBeenCalledWith(expect.objectContaining({ recipientScope: "seller_and_owner" }));
  });
  it("sends the saved contact a commercial message and copies owner and formal emitter", async () => {
    m.proposal.mockResolvedValue({ ...fixture, formal: { ...fixture.formal, issuerEmail: "emitter@example.test", recipientEmail: "client@example.test", recipientContactName: "Client <script>" } });
    const response = await POST(req({ sendToContact: true, to: "outsider@example.test" }), context);
    expect(response.status).toBe(200);
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: ["client@example.test"], cc: ["owner@example.test", "emitter@example.test"], replyTo: "emitter@example.test" }));
    const mail = m.send.mock.calls[0][0];
    expect(mail.html).toContain("Client &lt;script&gt;");expect(mail.html).not.toContain("uso interno");expect(mail.html).not.toContain("<script>");
    expect(m.delivery).toHaveBeenCalledWith(expect.objectContaining({ recipientScope: "customer_owner_and_emitter", recipients: { to: ["client@example.test"], cc: ["owner@example.test", "emitter@example.test"] } }));
    expect((await response.json()).recipientScope).toBe("customer_owner_and_emitter");
  });
  it.each([undefined, "invalid", "client@example.test\r\nBcc: attacker@example.test"])("blocks invalid saved contact %s", async recipientEmail => {
    m.proposal.mockResolvedValue({ ...fixture, formal: { ...fixture.formal, recipientEmail } });
    expect((await POST(req({ sendToContact: true }), context)).status).toBe(400);expect(m.send).not.toHaveBeenCalled();
  });
  it("requires the owner copy instead of silently omitting it", async () => {
    m.user.mockResolvedValue(null);
    m.proposal.mockResolvedValue({ ...fixture, formal: { ...fixture.formal, recipientEmail: "client@example.test" } });
    expect((await POST(req({ sendToContact: true }), context)).status).toBe(400);expect(m.send).not.toHaveBeenCalled();
  });
  it("deduplicates owner and emitter copies", async () => {
    m.proposal.mockResolvedValue({ ...fixture, formal: { ...fixture.formal, issuerEmail: "owner@example.test", recipientEmail: "client@example.test" } });
    await POST(req({ sendToContact: true }), context);
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: ["client@example.test"], cc: ["owner@example.test"] }));
  });
  it.each(["true", 1, null])("rejects non-boolean opt-in %s", async sendToContact => {
    expect((await POST(req({ sendToContact }), context)).status).toBe(400);expect(m.send).not.toHaveBeenCalled();
  });
  it("requires authorization even when customer delivery is enabled", async () => {
    m.proposal.mockResolvedValue({ ...fixture, status: "draft" });
    expect((await POST(req({ sendToContact: true }), context)).status).toBe(403);expect(m.send).not.toHaveBeenCalled();
  });
  it("does not record a failed dispatch", async () => {
    m.send.mockResolvedValue({ error: { message: "synthetic failure" } });
    expect((await POST(req(), context)).status).toBe(500);expect(m.delivery).not.toHaveBeenCalled();
  });
  it("warns after accepted dispatch if recording fails, without sending again", async () => {
    m.delivery.mockRejectedValue(new Error("synthetic db error"));
    const data = await (await POST(req(), context)).json();
    expect(data.ok).toBe(true);expect(data.warning).toContain("No lo reenvíes");expect(m.send).toHaveBeenCalledOnce();
  });
  it("does not dispatch if rendering raced a revision or revoked authorization", async () => {
    m.authorized.mockResolvedValue(false);
    expect((await POST(req(), context)).status).toBe(409); expect(m.send).not.toHaveBeenCalled();
  });
  it("hides another seller's proposal before rendering or sending", async () => {
    m.visible.mockResolvedValue(false);
    expect((await POST(req(), context)).status).toBe(404);expect(m.proposal).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
  });
});
