import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn(), set: vi.fn(), rate: vi.fn(), member: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findFirst: m.member } } }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ setTenantCapability: m.set, THREATDOWN_PDF_IMPORT: "threatdown_pdf_import" }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: m.rate, getRequestIdentity: () => "u1" }));
import { PATCH } from "./route";
const body = { capabilityKey: "threatdown_pdf_import", enabled: true };
function request(payload: unknown = body, context = "current-tenant") { return new Request("http://localhost/api/settings/tenant-capabilities", {
  method: "PATCH", headers: { "Content-Type": "application/json", "X-Tenant-Context": context }, body: JSON.stringify(payload),
}); }
describe("tenant capability administration", () => {
  beforeEach(() => { vi.clearAllMocks(); m.member.mockResolvedValue({ role: "superadmin" }); m.tenant.mockResolvedValue({ id: "current-tenant", userId: "u1", authMode: "clerk", isSuperAdmin: true }); m.rate.mockReturnValue({ allowed: true }); m.set.mockResolvedValue(true); });
  it("requires authentication", async () => { m.tenant.mockResolvedValue(null); expect((await PATCH(request())).status).toBe(401); expect(m.set).not.toHaveBeenCalled(); });
  it.each(["owner", "admin", "seller"])("forbids %s from enabling or disabling", async (userRole) => {
    m.tenant.mockResolvedValue({ id: "current-tenant", userId: "u1", authMode: "clerk", isSuperAdmin: false, userRole });
    for (const enabled of [true, false]) expect((await PATCH(request({ ...body, enabled }))).status).toBe(403);
    expect(m.set).not.toHaveBeenCalled();
  });
  it("uses only the authenticated tenant and actor", async () => {
    expect((await PATCH(request())).status).toBe(200);
    expect(m.set).toHaveBeenCalledWith({ tenantId: "current-tenant", ...body, actor: { userId: "u1", isSuperAdmin: true } });
  });
  it("allows superadmin to disable", async () => { m.set.mockResolvedValue(false); const result = await PATCH(request({ ...body, enabled: false })); expect(await result.json()).toEqual({ ...body, enabled: false }); });
  it("enables the CPQ preview only in the authenticated tenant", async () => {
    expect((await PATCH(request({ capabilityKey: "cpq_guided_preview", enabled: true }))).status).toBe(200);
    expect(m.set).toHaveBeenCalledWith({ tenantId: "current-tenant", capabilityKey: "cpq_guided_preview", enabled: true, actor: { userId: "u1", isSuperAdmin: true } });
  });
  it("does not let an owner enable CPQ", async () => {
    m.tenant.mockResolvedValue({ id: "current-tenant", userId: "u1", authMode: "clerk", isSuperAdmin: false });
    expect((await PATCH(request({ capabilityKey: "cpq_guided_preview", enabled: true }))).status).toBe(403);
    expect(m.set).not.toHaveBeenCalled();
  });
  it.each([{ ...body, tenantId: "other" }, { ...body, enabled: "true" }, { ...body, capabilityKey: "other" }, null])("rejects invalid or cross-tenant payload %j", async (payload) => { expect((await PATCH(request(payload))).status).toBe(422); expect(m.set).not.toHaveBeenCalled(); });
  it("rate limits changes", async () => { m.rate.mockReturnValue({ allowed: false }); expect((await PATCH(request())).status).toBe(429); expect(m.set).not.toHaveBeenCalled(); });
  it("rejects inactive tenants", async () => { m.set.mockResolvedValue(null); expect((await PATCH(request())).status).toBe(404); });
  it("does not grant configuration from claims when the database role is not superadmin", async () => {
    m.member.mockResolvedValue({ role: "owner" });
    expect((await PATCH(request({ capabilityKey: "mercadolibre_channel", enabled: true }))).status).toBe(403);
    expect(m.set).not.toHaveBeenCalled();
  });
  it("rejects a stale company context without changing either company", async () => {
    expect((await PATCH(request(body, "other"))).status).toBe(409); expect(m.set).not.toHaveBeenCalled();
  });
  it("enables and disables Mercado Libre independently in the session tenant", async () => {
    for (const enabled of [true, false]) {
      m.set.mockResolvedValue(enabled);
      expect((await PATCH(request({ capabilityKey: "mercadolibre_channel", enabled }))).status).toBe(200);
      expect(m.set).toHaveBeenLastCalledWith({ tenantId: "current-tenant", capabilityKey: "mercadolibre_channel", enabled,
        actor: { userId: "u1", isSuperAdmin: true } });
    }
  });
});

it("enables CRM pilot only in the session tenant", async () => {
  vi.clearAllMocks(); m.member.mockResolvedValue({ role: "superadmin" }); m.tenant.mockResolvedValue({ id: "sys", userId: "u1", authMode: "clerk", isSuperAdmin: true }); m.rate.mockReturnValue({ allowed: true }); m.set.mockResolvedValue(true);
  expect((await PATCH(request({ capabilityKey: "crm_workspace_pilot", enabled: true }, "sys"))).status).toBe(200);
  expect(m.set).toHaveBeenCalledWith({ tenantId: "sys", capabilityKey: "crm_workspace_pilot", enabled: true, actor: { userId: "u1", isSuperAdmin: true } });
});

 it("declares the optional playbook field through the existing superadmin control", async () => {
  vi.clearAllMocks(); m.member.mockResolvedValue({ role: "superadmin" }); m.tenant.mockResolvedValue({ id: "sys", userId: "u1", authMode: "clerk", isSuperAdmin: true }); m.rate.mockReturnValue({ allowed: true }); m.set.mockResolvedValue(false);
  expect((await PATCH(request({ capabilityKey: "quote_playbook_field", enabled: false }, "sys"))).status).toBe(200);
  expect(m.set).toHaveBeenCalledWith({ tenantId: "sys", capabilityKey: "quote_playbook_field", enabled: false, actor: { userId: "u1", isSuperAdmin: true } });
});
