import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ capture: vi.fn(), row: vi.fn(), update: vi.fn(), audit: vi.fn(), tx: {} as Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("./prisma", () => ({ prisma: { $transaction: async (callback: (tx: unknown) => unknown) => callback(m.tx) } }));
vi.mock("./won-notifications", () => ({ captureWonEvent: m.capture }));
vi.mock("./commercial-win-guard", () => ({ hasAnotherBusinessWin: async () => false }));
import { setProposalOutcomeByTenant } from "./proposals";
const actor = { userId: "salvador", userRole: "admin" as const, isSuperAdmin: false };
const closed = new Date("2026-08-28T06:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  m.row.mockResolvedValue({ tenant_id: "t", proposal_id: "p", opportunity_id: "o", origin: "q", status: "approved", outcome: null, outcome_at: null, created_at: new Date("2026-01-01T12:00:00Z") });
  m.tx = { $executeRaw: vi.fn(), $queryRaw: vi.fn(), proposals: { findFirst: m.row, update: m.update },
    proposal_audit_events: { create: m.audit }, opportunities: { findFirst: vi.fn().mockResolvedValue(null) }, formal_proposals: { findFirst: vi.fn().mockResolvedValue(null) } };
});
it("captures only the new won transition, not repeat save or date correction", async () => {
  expect(await setProposalOutcomeByTenant("t", "p", "won", actor, true, { closedOn: "2026-08-28" })).toBe("updated");
  expect(m.capture).toHaveBeenCalledTimes(1);
  m.row.mockResolvedValue({ tenant_id: "t", proposal_id: "p", status: "approved", outcome: "won", outcome_at: closed, created_at: new Date("2026-01-01T12:00:00Z") });
  await setProposalOutcomeByTenant("t", "p", "won", actor, true);
  await setProposalOutcomeByTenant("t", "p", "won", actor, true, { closedOn: "2026-08-29" });
  expect(m.capture).toHaveBeenCalledTimes(1);
});
it("does not capture lost or invalid outcomes", async () => {
  await setProposalOutcomeByTenant("t", "p", "lost", actor, true);
  expect(m.capture).not.toHaveBeenCalled();
  m.row.mockResolvedValue(null);
  expect(await setProposalOutcomeByTenant("foreign", "p", "won", actor, true)).toBe("not_found");
  expect(m.capture).not.toHaveBeenCalled();
});
