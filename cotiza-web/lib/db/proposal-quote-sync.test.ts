import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ transaction: vi.fn(), remove: vi.fn(), create: vi.fn(), audit: vi.fn(), clear: vi.fn(), update: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { $transaction: m.transaction } }));
import { syncProposalFromQuote } from "./proposal-quote-sync";
import { proposalQuoteSyncToken } from "@/lib/domain/proposal-quote-sync-token";
const actor = { userId: "seller", canSeeAll: false };
const previous = [{ itemNumber: 1, componentType: "product", costUnit: 160, priceUnit: 172.41, quantity: 1, description: "20 timbres", sku: "20PKTF", origin: "manual", status: "active" }];
let proposal: Record<string, unknown>; let formal: Record<string, unknown>; let current: typeof previous;
let quote: Record<string, unknown> | null;
describe("explicit synchronization from the exact linked quotation", () => {
  beforeEach(() => {
    vi.clearAllMocks(); current = previous;
    quote = { quote_id: "v1", quote_group_id: "g" };
    proposal = { origin: "v1", status: "draft", created_by_user_id: "seller" };
    formal = { quote_id: "v1", status: "draft" };
    m.transaction.mockImplementation(fn => fn({ $queryRaw: vi.fn(), $executeRaw: vi.fn(),
      proposals: { findFirst: async () => proposal, update: m.update }, quote: { findFirst: async () => quote },
      formal_proposals: { findFirst: async () => formal, updateMany: vi.fn() },
      proposal_items: { findMany: async () => current.map(i => ({ item_number: i.itemNumber, component_type: i.componentType, cost_unit: i.costUnit,
        price_unit: i.priceUnit, quantity: i.quantity, description: i.description, sku: i.sku, origin: i.origin, status: i.status })), deleteMany: m.remove, createMany: m.create },
      quote_lines: { findMany: async () => [{ line_id: "l1", cost_unit: 137.93, final_price_unit: 172.41, quantity: 1, description_final: "20 timbres", sku: "20PKTF", line_type: "product" }] },
      proposal_approvals: { deleteMany: m.clear }, proposal_audit_events: { create: m.audit },
    }));
  });
  it("replaces the old cost of 160 with 137.93 without changing the original quote version or authorizing", async () => {
    expect(await syncProposalFromQuote("t", "p", actor, proposalQuoteSyncToken(previous))).toBe("updated");
    expect(m.remove).toHaveBeenCalledWith({ where: { proposal_id: "p", tenant_id: "t" } });
    expect(m.create.mock.calls[0][0].data[0]).toMatchObject({ tenant_id: "t", proposal_id: "p", cost_unit: 137.93, price_unit: 172.41, subtotal_cost: 137.93 });
    expect(m.update.mock.calls[0][0].data.status).toBeUndefined(); expect(m.clear).toHaveBeenCalledOnce();
    expect(JSON.parse(m.audit.mock.calls[0][0].data.payload)).toMatchObject({ quoteId: "v1", actorUserId: "seller", previousItems: previous });
  });
  it("replays without writes when the quotation and proposal already match", async () => {
    current = previous.map(i => ({ ...i, costUnit: 137.93 }));
    expect(await syncProposalFromQuote("t", "p", actor, proposalQuoteSyncToken(current))).toBe("unchanged");
    expect(m.remove).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
  it.each(["approved", "in_review", "rejected"])("does not mutate a %s proposal", async status => {
    proposal.status = status;
    expect(await syncProposalFromQuote("t", "p", actor, proposalQuoteSyncToken(previous))).toBe("not_draft");
    expect(m.remove).not.toHaveBeenCalled();
  });
  it.each(["invoice_draft_id", "invoice_uuid", "invoice_status", "invoice_stamped_at"])("blocks fiscal state %s", async field => {
    proposal[field] = "present";
    expect(await syncProposalFromQuote("t", "p", actor, proposalQuoteSyncToken(previous))).toBe("fiscal_document");
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("refuses a foreign source, stale edit or another seller", async () => {
    quote = null; expect(await syncProposalFromQuote("t", "p", actor, proposalQuoteSyncToken(previous))).toBe("missing_quote");
    quote = { quote_id: "v1", quote_group_id: "g" }; formal.quote_id = "v2";
    expect(await syncProposalFromQuote("t", "p", actor, proposalQuoteSyncToken(previous))).toBe("conflict"); formal.quote_id = "v1";
    expect(await syncProposalFromQuote("t", "p", actor, "0".repeat(64))).toBe("conflict");
    expect(await syncProposalFromQuote("t", "p", { ...actor, userId: "other" }, proposalQuoteSyncToken(previous))).toBe("forbidden");
    expect(m.remove).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
});
