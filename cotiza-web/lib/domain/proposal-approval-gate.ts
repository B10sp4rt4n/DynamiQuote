export type ProposalApprovalGate = {
  canAuthorizeFinal: boolean;
  missingRoles: Array<"owner" | "superadmin">;
  observerApproved: boolean;
  ownerApproved: boolean;
};

export type ProposalApprovalGateInput = {
  approvals: Array<{
    approverRole: "superadmin" | "owner" | "admin" | "user";
    decision: "approved" | "rejected";
  }>;
  requireObserverApproval: boolean;
};

export function evaluateApprovalGate(input: ProposalApprovalGateInput): ProposalApprovalGate {
  const ownerApproved = input.approvals.some(
    (row) => row.decision === "approved" && row.approverRole === "owner",
  );
  const observerApproved = input.approvals.some(
    (row) => row.decision === "approved" && row.approverRole === "superadmin",
  );

  const missingRoles: Array<"owner" | "superadmin"> = [];
  if (!ownerApproved) {
    missingRoles.push("owner");
  }

  if (input.requireObserverApproval && !observerApproved) {
    missingRoles.push("superadmin");
  }

  return {
    canAuthorizeFinal: missingRoles.length === 0,
    missingRoles,
    observerApproved,
    ownerApproved,
  };
}
