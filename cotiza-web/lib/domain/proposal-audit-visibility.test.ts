import { describe, expect, it } from "vitest";
import { projectProposalAuditTimeline } from "./proposal-audit-visibility";
import type { ProposalAuditTimelineItem } from "@/lib/db/proposal-audit";

const event = (type: string, details: Record<string, unknown>): ProposalAuditTimelineItem => ({
  actorName: "Ana", createdAt: "2026-10-22T15:00:00.000Z", details, id: type, type,
});

describe("proposal audit visibility", () => {
  it("preserves operational facts, actor and time without leaking internal payloads", () => {
    const input = [
      event("status_change_requested", { fromStatus: "draft", resultStatus: "in_review", ok: true,
        marginPct: 21, actorUserId: "internal-id", privateNote: "private", nested: { token: "secret" } }),
      event("approval_decision", { decision: "rejected", approverRole: "owner", reason: "private commercial note" }),
      event("document_issued", { via: "email", status: "sent", watermark: false, token: "secret" }),
      event("outcome_changed", { fromOutcome: null, toOutcome: "won", selectedCloseDate: true, outcomeAt: "2026-10-22" }),
    ];
    const result = projectProposalAuditTimeline(input, false);
    expect(result.map((item) => item.details)).toEqual([
      { fromStatus: "draft", resultStatus: "in_review", ok: true },
      { decision: "rejected", approverRole: "owner" },
      { via: "email", status: "sent", watermark: false },
      { fromOutcome: null, toOutcome: "won", selectedCloseDate: true, outcomeAt: "2026-10-22" },
    ]);
    expect(result[0]).toMatchObject({ actorName: "Ana", createdAt: input[0].createdAt, id: input[0].id });
    expect(input[0].details.marginPct).toBe(21);
  });

  it("replaces raw failures with useful messages and omits unknown events", () => {
    const result = projectProposalAuditTimeline([
      event("status_change_requested", { ok: false, error: "postgres secret", requestedStatus: "approved" }),
      event("document_blocked", { via: "pdf", reason: "confidential margin policy" }),
      event("future_private_event", { secret: "not public" }),
      event("toString", { secret: "not public" }),
    ], false);
    expect(result).toHaveLength(2);
    expect(result[0].details.error).toContain("Consulta al administrador");
    expect(result[1].details.reason).toContain("Consulta al administrador");
    expect(JSON.stringify(result)).not.toMatch(/postgres|confidential|not public/);
  });

  it("keeps the existing full audit view for administrators", () => {
    const input = [event("future_private_event", { secret: "admin only" })];
    expect(projectProposalAuditTimeline(input, true)).toBe(input);
  });

  it("preserves the computed integrity result while hiding the internal contract", () => {
    const input = { ...event("outcome_changed", { toOutcome: "won", commercialAct: { actors: [{ actor_id: "private-id" }] } }),
      integrity: "hash_mismatch" as const };
    const output = projectProposalAuditTimeline([input], false);
    expect(output[0].integrity).toBe("hash_mismatch");
    expect(output[0].details).toEqual({ toOutcome: "won" });
  });
});
