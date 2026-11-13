import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/email/approval-dispatch", () => ({ scheduleApprovalEmails: vi.fn() }));
const m = vi.hoisted(() => ({ tenant: vi.fn(), act: vi.fn(), view: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/won-consolidation", () => ({ actOnWin: m.act, getWinView: m.view, WinError: class extends Error { status = 409; } }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: () => ({ allowed: true }) }));
import { GET, POST } from "./route";
const ctx = { params: Promise.resolve({ proposalId: "p1" }) };
const input = { action: "accept", expectedRevision: 0, expectedPolicyRevision: 1, acceptedOn: "2026-10-01", evidence: "Contrato firmado" };
function request(extra: Record<string, string> = {}, body: unknown = input) { return new Request("https://cotiza.test/api/proposals/p1/consolidation", { method: "POST", headers: { origin: "https://cotiza.test", "X-Tenant-Context": "a", ...extra }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "a", userId: "seller", userRole: "user", isSuperAdmin: false, authMode: "clerk" }); m.act.mockResolvedValue({ state: "pending" }); });
it("requires an identified Clerk session and rejects bootstrap", async () => {
  for (const tenant of [null, { id: "a", userId: "bootstrap:a", authMode: "bootstrap" }]) {
    m.tenant.mockResolvedValue(tenant); expect((await POST(request(), ctx)).status).toBe(401); expect((await GET(request(), ctx)).status).toBe(401);
  }
  expect(m.act).not.toHaveBeenCalled();
});
it("rejects a cross-site request, a changed tenant and client supplied actor", async () => {
  expect((await POST(request({ origin: "https://other.test" }), ctx)).status).toBe(403);
  expect((await POST(request({ "X-Tenant-Context": "b" }), ctx)).status).toBe(409);
  expect((await POST(request({}, { ...input, actorId: "owner" }), ctx)).status).toBe(422);
  expect(m.act).not.toHaveBeenCalled();
});
it("uses the authenticated actor and exact proposal while returning a non-cacheable view", async () => {
  const result = await POST(request(), ctx); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
  expect(m.act).toHaveBeenCalledWith("a", "p1", expect.objectContaining({ userId: "seller", userRole: "user" }), input);
});
