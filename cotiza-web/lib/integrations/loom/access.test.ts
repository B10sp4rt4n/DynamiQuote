import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn(), member: vi.fn(), client: vi.fn(), opportunity: vi.fn(), cap: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.cap }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findFirst: m.member }, client: { findFirst: m.client }, opportunities: { findFirst: m.opportunity } } }));
import { authorizeLoom } from "./access";
import { loomPilotVisible } from "./availability";
const viewer = { id: "one", userId: "super", authMode: "clerk", isSuperAdmin: true };
const req = (origin = "https://cotiza.test", tenant = "one") => new Request("https://cotiza.test/api/clients/client/loom", { method: "POST", headers: { origin, "x-tenant-context": tenant } });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("COTIZA_LOOM_ENABLED", "true"); vi.stubEnv("COTIZA_LOOM_TENANT_ID", "one");
  vi.stubEnv("COTIZA_LOOM_CLOUD_ID", "9061827c-eca4-4635-819e-8a2927a7c7ee"); vi.stubEnv("COTIZA_LOOM_EMAIL", "reader@example.test");
  vi.stubEnv("COTIZA_LOOM_API_TOKEN", "synthetic"); vi.stubEnv("COTIZA_LOOM_PREVIEW_KEY", "ab".repeat(32));
  vi.stubEnv("COTIZA_LOOM_APP_ORIGIN", "https://cotiza.test"); m.tenant.mockResolvedValue(viewer);
  m.member.mockResolvedValue({ role: "superadmin" }); m.client.mockResolvedValue({ client_id: "client" }); m.cap.mockResolvedValue(true);
  m.opportunity.mockResolvedValue({ opportunity_id: "opp", client_id: "client" });
});
afterEach(() => vi.unstubAllEnvs());
it("requires Clerk, explicit company entitlement and authoritative superadmin membership", async () => {
  m.tenant.mockResolvedValue({ ...viewer, authMode: "bootstrap" }); await expect(authorizeLoom(req(), "client", "client")).rejects.toMatchObject({ status: 401 });
  m.tenant.mockResolvedValue(viewer); m.cap.mockResolvedValue(false); await expect(authorizeLoom(req(), "client", "client")).rejects.toMatchObject({ status: 404 });
  m.cap.mockResolvedValue(true); m.member.mockResolvedValue({ role: "owner" }); await expect(authorizeLoom(req(), "client", "client")).rejects.toMatchObject({ status: 403 });
  expect(m.client).not.toHaveBeenCalled();
});
it("rejects a stale company or foreign origin before reading dossier data", async () => {
  await expect(authorizeLoom(req("https://evil.test"), "client", "client")).rejects.toMatchObject({ status: 403 });
  await expect(authorizeLoom(req(undefined, "two"), "client", "client")).rejects.toMatchObject({ status: 409 });
  expect(m.client).not.toHaveBeenCalled();
});
it("resolves client and opportunity from the session company, never from caller data", async () => {
  const context = await authorizeLoom(req(), "opportunity", "opp");
  expect(context).toMatchObject({ tenantId: "one", actorId: "super", clientId: "client", opportunityId: "opp" });
  expect(m.opportunity).toHaveBeenCalledWith({ where: { tenant_id: "one", opportunity_id: "opp" }, select: { opportunity_id: true, client_id: true } });
  m.opportunity.mockResolvedValue(null); await expect(authorizeLoom(req(), "opportunity", "foreign")).rejects.toMatchObject({ status: 404 });
});
it("keeps UI unavailable for other companies or non-superadmins without querying entitlements", async () => {
  expect(await loomPilotVisible({ ...viewer, id: "two" })).toBe(false);
  expect(await loomPilotVisible({ ...viewer, isSuperAdmin: false })).toBe(false);
  expect(m.cap).not.toHaveBeenCalled();
});
