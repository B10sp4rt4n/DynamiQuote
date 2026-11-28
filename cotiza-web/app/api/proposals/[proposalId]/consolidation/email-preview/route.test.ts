import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn(), view: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/won-consolidation", () => ({ getWinView: m.view, WinError: class extends Error { status = 404; } }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: m.limit }));
import { POST } from "./route";
const ctx = { params: Promise.resolve({ proposalId: "p1" }) };
function request(extra: Record<string, string> = {}, filename = "confirmacion.eml") {
  const form = new FormData(); form.set("data", JSON.stringify({ action: "preview-email" }));
  form.set("file", new File(["From: Ana Cliente <cliente@example.test>\r\nDate: Fri, 27 Nov 2026 20:45:00 -0600\r\nSubject: Re: PROP-1\r\n\r\nAcepto PROP-1 por 100 USD"], filename));
  return new Request("https://cotiza.test/api/proposals/p1/consolidation/email-preview", { method: "POST", headers: { origin: "https://cotiza.test", "X-Tenant-Context": "a", ...extra }, body: form });
}
beforeEach(() => { vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "a", userId: "seller", authMode: "clerk" }); m.view.mockResolvedValue({ canRecordAcceptance: true }); m.limit.mockReturnValue({ allowed: true }); });
it("authenticates, enforces origin/tenant and checks proposal acceptance permissions before parsing", async () => {
  m.tenant.mockResolvedValueOnce(null); expect((await POST(request(), ctx)).status).toBe(401);
  expect((await POST(request({ origin: "https://other.test" }), ctx)).status).toBe(403);
  expect((await POST(request({ "X-Tenant-Context": "b" }), ctx)).status).toBe(409);
  expect(m.view).not.toHaveBeenCalled();
  m.view.mockResolvedValueOnce({ canRecordAcceptance: false }); expect((await POST(request(), ctx)).status).toBe(403);
});
it("returns a non-cacheable preview bound to the exact authenticated proposal without recording acceptance", async () => {
  const result = await POST(request(), ctx); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toMatchObject({ tenantId: "a", proposalId: "p1", acceptedOn: "2026-11-27", email: { senderName: "Ana Cliente", senderEmail: "cliente@example.test", sentAt: "2026-11-28T02:45:00.000Z" } });
  expect(m.view).toHaveBeenCalledWith("a", "p1", expect.objectContaining({ userId: "seller" }));
});
it("rejects non-email content and limits repeated parsing", async () => {
  expect((await POST(request({}, "renamed.pdf"), ctx)).status).toBe(422);
  m.limit.mockReturnValueOnce({ allowed: false }); expect((await POST(request(), ctx)).status).toBe(429);
});
