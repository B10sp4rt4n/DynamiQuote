import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn(), member: vi.fn(), set: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findFirst: m.member } } }));
vi.mock("@/lib/db/tenant-operation", () => ({ setTenantOperationMode: m.set }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: m.rate, getRequestIdentity: () => "actor" }));
import { PATCH } from "./route";
const request = (payload: unknown = { mode: "mixed" }, context = "a") => new Request("https://cotiza.test/api/settings/tenant-operation", {
  method: "PATCH", headers: { "Content-Type": "application/json", "X-Tenant-Context": context }, body: JSON.stringify(payload),
});
beforeEach(() => {
  vi.resetAllMocks(); m.tenant.mockResolvedValue({ id: "a", userId: "actor", isSuperAdmin: true, authMode: "clerk" });
  m.member.mockResolvedValue({ role: "superadmin" }); m.set.mockImplementation(async input => input.mode); m.rate.mockReturnValue({ allowed: true });
});
it.each(["consultative", "pos", "mixed"])("saves %s using only the authenticated tenant and actor", async mode => {
  const result = await PATCH(request({ mode })); expect(result.status).toBe(200); expect(await result.json()).toEqual({ mode });
  expect(m.set).toHaveBeenCalledWith({ tenantId: "a", mode, actor: { userId: "actor", isSuperAdmin: true } });
});
it.each([null, { id: "a", userId: "bootstrap:a", authMode: "bootstrap", isSuperAdmin: true }])("rejects unauthenticated and bootstrap identities", async tenant => {
  m.tenant.mockResolvedValue(tenant); expect((await PATCH(request())).status).toBe(401); expect(m.set).not.toHaveBeenCalled();
});
it.each(["owner", "admin", "user"])("prevents %s from configuring even with a superadmin claim", async role => {
  m.member.mockResolvedValue({ role }); expect((await PATCH(request())).status).toBe(403); expect(m.set).not.toHaveBeenCalled();
});
it("rejects missing or inactive authoritative membership", async () => {
  m.member.mockResolvedValue(null); expect((await PATCH(request())).status).toBe(403); expect(m.set).not.toHaveBeenCalled();
  expect(m.member).toHaveBeenCalledWith({ where: { user_id: "actor", active: true }, select: { role: true } });
});
it.each([{ mode: "invalid" }, { mode: "mixed", tenantId: "b" }, { mode: "pos", mercadoLibre: true }, null])("rejects invalid and cross-tenant payloads", async body => {
  expect((await PATCH(request(body))).status).toBe(422); expect(m.set).not.toHaveBeenCalled();
});
it("rejects stale context and rate limits writes", async () => {
  expect((await PATCH(request({ mode: "pos" }, "b"))).status).toBe(409); expect(m.set).not.toHaveBeenCalled();
  m.rate.mockReturnValue({ allowed: false }); expect((await PATCH(request())).status).toBe(429); expect(m.set).not.toHaveBeenCalled();
});
it("does not save to an inactive tenant", async () => {
  m.set.mockResolvedValue(null); expect((await PATCH(request())).status).toBe(404);
});
