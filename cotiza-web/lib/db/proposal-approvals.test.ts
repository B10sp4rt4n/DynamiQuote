import { describe, expect, it } from "vitest";

import { evaluateApprovalGate } from "@/lib/domain/proposal-approval-gate";

import type { ProposalApprovalRecord } from "./proposal-approvals";

function approval(overrides: Partial<ProposalApprovalRecord>): ProposalApprovalRecord {
  return {
    approvalId: "appr-1",
    approverRole: "owner",
    approverUserId: "user-owner-1",
    createdAt: "2026-05-10T00:00:00.000Z",
    decision: "approved",
    proposalId: "prop-1",
    reason: null,
    tenantId: "tenant-1",
    ...overrides,
  };
}

describe("evaluateApprovalGate", () => {
  it("exige owner cuando no hay aprobacion de owner", () => {
    const gate = evaluateApprovalGate({
      approvals: [approval({ approverRole: "admin" })],
      requireObserverApproval: false,
    });

    expect(gate.canAuthorizeFinal).toBe(false);
    expect(gate.missingRoles).toContain("owner");
  });

  it("autoriza cuando owner aprobo y no se requiere observador", () => {
    const gate = evaluateApprovalGate({
      approvals: [approval({ approverRole: "owner" })],
      requireObserverApproval: false,
    });

    expect(gate.ownerApproved).toBe(true);
    expect(gate.canAuthorizeFinal).toBe(true);
  });

  it("requiere superadmin cuando el observador es obligatorio", () => {
    const gate = evaluateApprovalGate({
      approvals: [approval({ approverRole: "owner" })],
      requireObserverApproval: true,
    });

    expect(gate.canAuthorizeFinal).toBe(false);
    expect(gate.missingRoles).toContain("superadmin");
  });
});