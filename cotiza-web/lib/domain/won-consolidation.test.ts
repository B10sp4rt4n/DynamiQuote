import { expect, it } from "vitest";
import { applicableRules, mayApprove, winPolicySchema, type WinRule } from "./won-consolidation";
export const finance: WinRule = { id: "finance", label: "Finanzas", approverRoles: ["admin"], approverUserIds: [], allowSelfApproval: false,
  evidenceRequired: true, allowWaiver: false, dependsOn: [], minimumAmount: null, currency: null };
it("accepts the minimum policy and rejects duplicate, unknown and circular prerequisites", () => {
  expect(winPolicySchema.safeParse({ rules: [] }).success).toBe(true);
  for (const rules of [[finance, finance], [{ ...finance, dependsOn: ["missing"] }], [{ ...finance, dependsOn: ["finance"] }],
    [{ ...finance, dependsOn: ["legal"] }, { ...finance, id: "legal", dependsOn: ["finance"] }]]) {
    expect(winPolicySchema.safeParse({ rules }).success).toBe(false);
  }
});
it("does not assume exchange rates or let a missing responsible authorize", () => {
  const rule = { ...finance, minimumAmount: 100, currency: "MXN" as const };
  expect(applicableRules({ rules: [rule] }, 99, "MXN")).toEqual([]);
  expect(applicableRules({ rules: [rule] }, 100, "MXN")).toHaveLength(1);
  expect(() => applicableRules({ rules: [rule] }, 100, "USD")).toThrow("moneda");
  expect(mayApprove(finance, { userId: "seller", userRole: "admin", isSuperAdmin: false }, "seller")).toBe(false);
  expect(mayApprove(finance, { userId: "admin", userRole: "admin", isSuperAdmin: false }, null)).toBe(false);
  expect(mayApprove(finance, { userId: "super", userRole: "superadmin", isSuperAdmin: true }, "seller")).toBe(false);
});
