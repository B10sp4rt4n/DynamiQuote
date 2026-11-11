import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ transaction: vi.fn(), update: vi.fn(), audit: vi.fn(), win: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/lib/db/commercial-win-guard", () => ({ hasAnotherBusinessWin: m.win }));
import { setProposalOutcomeByTenant } from "./proposals";
const actor = { userId: "admin1", userRole: "admin" as const, isSuperAdmin: false };
const input = { closedOn: "2026-10-29", expectedOutcome: "won" as const,
  expectedOutcomeAt: "2026-11-10T06:00:00.000Z", closeDateOverrideReason: "Negocio previo al alta en Cotiza" };
describe("commercial close override transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.transaction.mockImplementation(fn => fn({
      $queryRaw: vi.fn(), $executeRaw: vi.fn(),
      proposals: { findFirst: async () => ({ proposal_id: "p1", tenant_id: "t1", status: "approved", outcome: "won",
        outcome_at: new Date(input.expectedOutcomeAt), created_at: new Date("2026-11-10T18:00Z"), opportunity_id: "o1", created_by_user_id: "admin1" }), update: m.update },
      opportunities: { findFirst: async () => ({ created_at: new Date("2026-11-10T18:00Z") }) },
      formal_proposals: { findFirst: async () => null },
      proposal_audit_events: { create: m.audit },
    }));
  });
  it("stores October closure and records the authenticated actor, reason and previous date", async () => {
    expect(await setProposalOutcomeByTenant("t1", "p1", "won", actor, true, input)).toBe("updated");
    expect(m.update).toHaveBeenCalledWith({ where: { proposal_id: "p1" }, data: { outcome: "won", outcome_at: new Date("2026-10-29T06:00Z") } });
    const event = m.audit.mock.calls[0][0].data;
    expect(event).toMatchObject({ tenant_id: "t1", proposal_id: "p1", event_type: "outcome_date_changed" });
    expect(JSON.parse(event.payload)).toMatchObject({ closeDateOverride: true, closeDateOverrideReason: input.closeDateOverrideReason,
      authorizedByUserId: "admin1", authorizerRole: "admin", previousOutcomeAt: input.expectedOutcomeAt,
      outcomeAt: "2026-10-29T06:00:00.000Z", commercialStartDay: "2026-11-10" });
  });
  it("rejects a seller even if the caller passes canSeeAll", async () => {
    expect(await setProposalOutcomeByTenant("t1", "p1", "won", { ...actor, userRole: "user" }, true, input)).toBe("forbidden");
    expect(m.update).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
  it.each([
    [{ closeDateOverrideReason: undefined }, "invalid_date"],
    [{ closeDateOverrideReason: "short" }, "invalid_date"],
    [{ closedOn: "2999-01-01" }, "invalid_date"],
    [{ closedOn: "2026-02-30" }, "invalid_date"],
    [{ expectedOutcomeAt: null }, "conflict"],
    [{ expectedOutcome: undefined, expectedOutcomeAt: undefined }, "conflict"],
  ])("rejects invalid or stale exception %j without writing", async (extra, result) => {
    expect(await setProposalOutcomeByTenant("t1", "p1", "won", actor, true, { ...input, ...extra })).toBe(result);
    expect(m.update).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
});
