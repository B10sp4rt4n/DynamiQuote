import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn(), member: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findFirst: m.member } } }));
import { authorizeMercadoLibre } from "./access";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MERCADOLIBRE_ENABLED", "true"); vi.stubEnv("MERCADOLIBRE_TENANT_IDS", "t1,t2");
  vi.stubEnv("MERCADOLIBRE_CLIENT_ID", "123"); vi.stubEnv("MERCADOLIBRE_CLIENT_SECRET", "synthetic");
  vi.stubEnv("MERCADOLIBRE_TOKEN_KEY", "ab".repeat(32)); vi.stubEnv("MERCADOLIBRE_REDIRECT_URI", "https://cotiza.test/api/integrations/mercadolibre/callback");
  m.tenant.mockResolvedValue({ id: "t1", userId: "u1", authMode: "clerk", name: "Company", isSuperAdmin: true });
  m.member.mockResolvedValue({ tenant_id: "t1", role: "owner" });
});
afterEach(() => vi.unstubAllEnvs());
it("rejects unauthenticated and bootstrap access before reading a membership", async () => {
  for (const tenant of [null, { authMode: "bootstrap", userId: "u1" }]) {
    m.tenant.mockResolvedValue(tenant); await expect(authorizeMercadoLibre()).rejects.toMatchObject({ status: 401 });
  }
  expect(m.member).not.toHaveBeenCalled();
});
it("rejects a disabled company even for superadmins", async () => {
  vi.stubEnv("MERCADOLIBRE_TENANT_IDS", "t2"); await expect(authorizeMercadoLibre()).rejects.toMatchObject({ status: 404 });
});
it("requires an authoritative administrative role and tenant membership despite claims", async () => {
  for (const member of [null, { role: "user", tenant_id: "t1" }, { role: "owner", tenant_id: "t2" }]) {
    m.member.mockResolvedValue(member); await expect(authorizeMercadoLibre()).rejects.toMatchObject({ status: 403 });
  }
});
it("binds mutations to the configured origin and resolves tenant/actor on the server", async () => {
  for (const origin of [null, "https://evil.test"]) {
    await expect(authorizeMercadoLibre(new Request("https://cotiza.test/api", { method: "POST", headers: origin ? { origin } : {} }))).rejects.toMatchObject({ status: 403 });
  }
  expect(await authorizeMercadoLibre(new Request("https://cotiza.test/api", { method: "POST", headers: { origin: "https://cotiza.test" } }))).toEqual({ tenantId: "t1", actorId: "u1", tenantName: "Company" });
});
