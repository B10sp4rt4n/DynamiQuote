import { describe, expect, it } from "vitest";

import { evaluateApprovalGate } from "@/lib/domain/proposal-approval-gate";

describe("proposal-approval-gate", () => {
  it("toma superadmin como aprobacion valida de owner", () => {
    const result = evaluateApprovalGate({
      approvals: [
        {
          approverRole: "superadmin",
          decision: "approved",
        },
      ],
      requireObserverApproval: false,
    });

    expect(result.canAuthorizeFinal).toBe(true);
    expect(result.ownerApproved).toBe(true);
    expect(result.missingRoles).toEqual([]);
  });

  it("mantiene gate de observador cuando tenant lo requiere", () => {
    const result = evaluateApprovalGate({
      approvals: [
        {
          approverRole: "owner",
          decision: "approved",
        },
      ],
      requireObserverApproval: true,
    });

    expect(result.canAuthorizeFinal).toBe(false);
    expect(result.ownerApproved).toBe(true);
    expect(result.observerApproved).toBe(false);
    expect(result.missingRoles).toEqual(["superadmin"]);
  });
});
