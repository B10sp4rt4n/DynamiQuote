import { describe, it, expect } from "vitest";
import { approvalInputSchema, assertCredentialPolicy, bootstrapFresh, canonical, digest, snapshotFor, tokenHash, tokenMatches } from "./verified-authorization";
import { checkApprovalPost } from "@/lib/auth/approval-request-security";
const input = { kind: "purchase" as const, approverUserId: "user_owner", purchase: { folio: "SYN-1", vendor: "Proveedor de ensayo", amount: "1250.00", currency: "MXN" as const, description: "Ensayo" } };
describe("verified authorization policy", () => {
  it("canonicalizes order without normalizing meaningful content", () => {
    expect(digest({ a: 1, b: ["x", "y"] })).toBe(digest({ b: ["x", "y"], a: 1 }));
    expect(digest(["x", "y"])).not.toBe(digest(["y", "x"]));
    expect(() => canonical({ a: undefined })).toThrow(); expect(() => canonical(NaN)).toThrow();
  });
  it("binds company, approver, amount, currency, content and credential policy", () => {
    const value = snapshotFor({ id: "syn", name: "SynAppsSys" }, input);
    for (const change of [{ ...value, tenantId: "other" }, { ...value, credentialPolicy: "registered" },
      { ...value, input: { ...input, approverUserId: "user_other" } },
      { ...value, input: { ...input, purchase: { ...input.purchase, amount: "1250.01" } } },
      { ...value, input: { ...input, purchase: { ...input.purchase, currency: "USD" } } }]) expect(digest(change)).not.toBe(digest(value));
  });
  it.each(["0.00", "-1.00", "1", "1.001", "01.00", "1e3", "1,000.00"])("rejects ambiguous amount %s", amount => {
    expect(approvalInputSchema.safeParse({ ...input, purchase: { ...input.purchase, amount } }).success).toBe(false);
  });
  it("rejects client-supplied tenant and approver identity fields", () => {
    expect(approvalInputSchema.safeParse({ ...input, tenantId: "other" }).success).toBe(false);
    expect(approvalInputSchema.safeParse({ ...input, userId: "user_other" }).success).toBe(false);
  });
  it("distinguishes backup eligibility from current backup state", () => {
    expect(() => assertCredentialPolicy("multiDevice", false, true)).toThrow("sincronizables");
    expect(() => assertCredentialPolicy("singleDevice", true, false)).toThrow();
    expect(() => assertCredentialPolicy("singleDevice", false, true)).not.toThrow();
    expect(() => assertCredentialPolicy("multiDevice", true, false)).not.toThrow();
  });
  it("requires nominated identity, fresh factor, reverification ID and temporary bootstrap window", () => {
    const now = new Date("2026-11-16T12:00:00Z"), until = "2026-11-16T12:15:00Z", claims = { fva: [0, -1], reverification_id: "rv1" };
    expect(bootstrapFresh(claims, now, until, ["user_owner"], "user_owner")).toBe(true);
    for (const c of [{ fva: [2], reverification_id: "rv1" }, { fva: [0] }, { fva: [-1], reverification_id: "rv1" }]) expect(bootstrapFresh(c, now, until, ["user_owner"], "user_owner")).toBe(false);
    expect(bootstrapFresh(claims, now, until, ["user_owner"], "user_other")).toBe(false);
    expect(bootstrapFresh(claims, now, "2026-11-20T12:00:00Z", ["user_owner"], "user_owner")).toBe(false);
  });
  it("stores link hashes and compares only exact tokens", () => {
    expect(tokenMatches("secret", tokenHash("secret"))).toBe(true);
    expect(tokenMatches("other", tokenHash("secret"))).toBe(false);
    expect(tokenMatches("secret", "not-a-hash")).toBe(false);
  });
  it("requires same-origin JSON and an exact tenant header", () => {
    const headers = { origin: "https://cotiza.example.test", "content-type": "application/json", "x-approval-tenant": "syn" };
    expect(() => checkApprovalPost(new Request("https://cotiza.example.test/api", { headers }), headers.origin, "syn")).not.toThrow();
    for (const changed of [{ ...headers, origin: "https://evil.example" }, { ...headers, "x-approval-tenant": "other" }, { ...headers, "content-type": "text/plain" }]) expect(() => checkApprovalPost(new Request("https://cotiza.example.test/api", { headers: changed }), headers.origin, "syn")).toThrow();
  });
});
