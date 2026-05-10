import { describe, expect, it } from "vitest";

import { marginPolicyInputSchema } from "./margin-policy";

describe("marginPolicyInputSchema", () => {
  it("acepta una politica valida", () => {
    const result = marginPolicyInputSchema.safeParse({
      highPreapprovalMarginPct: 55,
      maxMarginPct: 35,
      minMarginPct: 10,
      requireObserverApproval: true,
    });

    expect(result.success).toBe(true);
  });

  it("rechaza cuando el minimo es mayor al maximo", () => {
    const result = marginPolicyInputSchema.safeParse({
      highPreapprovalMarginPct: 55,
      maxMarginPct: 20,
      minMarginPct: 30,
      requireObserverApproval: false,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza cuando el maximo supera el umbral alto", () => {
    const result = marginPolicyInputSchema.safeParse({
      highPreapprovalMarginPct: 30,
      maxMarginPct: 35,
      minMarginPct: 10,
      requireObserverApproval: false,
    });

    expect(result.success).toBe(false);
  });
});