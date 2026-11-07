import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("./prisma", () => ({ prisma: {} }));
import { captureWonEvent } from "./won-notifications";
const proposal = { tenant_id: "t", proposal_id: "p", opportunity_id: "o", origin: "q", outcome: null };
const now = new Date("2026-11-07T18:00:00Z");
function mockTx() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ enabled: true, include_owner: true, designated_user_ids: ["salvador"], version: 3 }]),
    quote: { findFirst: vi.fn().mockResolvedValue({ quote_id: "q", opportunity_id: "o", client_id: "c", version: 1 }) },
    opportunities: { findFirst: vi.fn().mockResolvedValue({ opportunity_id: "o", client_id: "c", opportunity_number: "OPP-0042", owner_user_id: "salvador", title: "Demo" }) },
    client: { findFirst: vi.fn().mockResolvedValue({ client_id: "c", company: "Demo client" }) },
    formal_proposals: { findFirst: vi.fn().mockResolvedValue({ quote_id: "q", proposal_number: "PROP-0042", currency: "MXN" }) },
    app_users: { findMany: vi.fn().mockResolvedValue([{ user_id: "salvador", email: "salvador@example.com" }]) },
    proposal_items: { aggregate: vi.fn().mockResolvedValue({ _sum: { subtotal_price: new Prisma.Decimal("85000.01") } }) },
    proposal_audit_events: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
  };
}
describe("transactional win capture", () => {
  beforeEach(() => vi.stubEnv("COTIZA_WON_EVENT_PILOT", "true"));
  afterEach(() => vi.unstubAllEnvs());
  it("stores commercial date, precise amount, winning version and both reasons once", async () => {
    const tx = mockTx();
    await captureWonEvent(tx as unknown as Prisma.TransactionClient, proposal, "actor", new Date("2026-08-28T06:00:00Z"), now);
    const data = tx.proposal_audit_events.create.mock.calls[0][0].data;
    const event = JSON.parse(data.payload);
    expect(data).toMatchObject({ tenant_id: "t", proposal_id: "p", event_type: "opportunity.closed_won" });
    expect(event).toMatchObject({ occurred_at: now.toISOString(), closed_on: "2026-08-28", closure_sequence: 1,
      opportunity: { winning_proposal: { version: 1, amount: "85000.0100" } } });
    expect(event.notification.recipients).toEqual([{ user_id: "salvador", reasons: ["opportunity_owner", "tenant_designated"], channels: ["in_app", "email"] }]);
  });
  it("does not touch policy storage when the pilot is disabled", async () => {
    vi.stubEnv("COTIZA_WON_EVENT_PILOT", "false"); const tx = mockTx();
    await captureWonEvent(tx as unknown as Prisma.TransactionClient, proposal, "actor", now, now);
    expect(tx.$queryRaw).not.toHaveBeenCalled(); expect(tx.proposal_audit_events.create).not.toHaveBeenCalled();
  });
  it("records missing client as incomplete instead of inventing one", async () => {
    const tx = mockTx(); tx.client.findFirst.mockResolvedValue(null);
    await captureWonEvent(tx as unknown as Prisma.TransactionClient, proposal, "actor", now, now);
    expect(tx.proposal_audit_events.create.mock.calls[0][0].data.event_type).toBe("opportunity_won_incomplete");
  });
  it("numbers a new winning version after previous wins of this opportunity only", async () => {
    const tx = mockTx(); tx.proposal_audit_events.findMany.mockResolvedValue([
      { payload: JSON.stringify({ opportunity_id: "o" }) }, { payload: JSON.stringify({ opportunity_id: "different" }) },
    ]);
    await captureWonEvent(tx as unknown as Prisma.TransactionClient, proposal, "actor", now, now);
    expect(JSON.parse(tx.proposal_audit_events.create.mock.calls[0][0].data.payload).closure_sequence).toBe(2);
  });
  it("preserves the close and flags unsupported negative totals for review", async () => {
    const tx = mockTx();
    tx.proposal_items.aggregate.mockResolvedValue({ _sum: { subtotal_price: new Prisma.Decimal("-1") } });
    await captureWonEvent(tx as unknown as Prisma.TransactionClient, proposal, "actor", now, now);
    expect(tx.proposal_audit_events.create.mock.calls[0][0].data.event_type).toBe("opportunity_won_incomplete");
  });

});
