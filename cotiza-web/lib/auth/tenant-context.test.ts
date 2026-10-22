import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), credentials: vi.fn(), cookies: vi.fn(), user: vi.fn(), tenant: vi.fn(), bootstrap: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("next/headers", () => ({ cookies: m.cookies }));
vi.mock("@/lib/auth/clerk", () => ({ hasClerkCredentials: m.credentials }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findUnique: m.user }, tenant: { findFirst: m.tenant } } }));
vi.mock("@/lib/db/tenants", () => ({ getBootstrapTenant: m.bootstrap }));
import { getCurrentTenantContext } from "./tenant-context";
const user = { user_id: "user_A", active: true, alias: "seller", first_name: "Ana", last_name: "Ruiz", tenant_id: "tenant-a", role: "user" };
let jar: Record<string, string>;
describe("exact tenant membership", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production"); jar = {};
    m.cookies.mockImplementation(async () => ({ get: (key: string) => jar[key] ? { value: jar[key] } : undefined }));
    m.credentials.mockReturnValue(true); m.auth.mockResolvedValue({ userId: "user_A", sessionClaims: {} }); m.user.mockResolvedValue({ ...user });
    m.tenant.mockImplementation(async ({ where }) => where.tenant_id === "tenant-a" || where.slug === "a"
      ? { tenant_id: "tenant-a", name: "A", slug: "a" } : where.slug === "b" ? { tenant_id: "tenant-b", name: "B", slug: "b" } : null);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("resolves the exact local membership", async () => {
    expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant-a", userRole: "user", userId: "user_A" });
    expect(m.user).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: "user_A" } }));
  });
  it("denies missing authentication", async () => { m.auth.mockResolvedValue({ userId: null }); expect(await getCurrentTenantContext()).toBeNull(); });
  it.each([null, { ...user, active: false }, { ...user, tenant_id: null }])("denies missing/inactive/unassigned membership %j", async (row) => {
    m.user.mockResolvedValue(row); expect(await getCurrentTenantContext()).toBeNull(); expect(m.bootstrap).not.toHaveBeenCalled();
  });
  it("cannot recover a superadmin by names, alias or unsafe metadata", async () => {
    m.user.mockResolvedValue(null); m.auth.mockResolvedValue({ userId: "attacker", sessionClaims: { email: "seller@foreign.example", first_name: "Ana", last_name: "Ruiz", unsafeMetadata: { role: "superadmin", tenantId: "tenant-b" } } });
    expect(await getCurrentTenantContext()).toBeNull();
  });
  it("ignores forged or stale role and tenant claims", async () => {
    m.auth.mockResolvedValue({ userId: "user_A", sessionClaims: { metadata: { role: "superadmin", tenantId: "tenant-b" } } });
    expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant-a", isSuperAdmin: false });
  });
  it.each(["production", "development"])("ignores seller tenant override in %s", async (env) => {
    vi.stubEnv("NODE_ENV", env); jar.tenant_override_slug = "b"; expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant-a" });
  });
  it("allows registered superadmin to select a tenant", async () => {
    jar.tenant_override_slug = "b"; m.user.mockResolvedValue({ ...user, role: "superadmin" });
    expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant-b", isSuperAdmin: true });
  });
  it("rejects invalid override instead of bootstrap fallback", async () => {
    jar.tenant_override_slug = "missing"; m.user.mockResolvedValue({ ...user, role: "superadmin" }); expect(await getCurrentTenantContext()).toBeNull();
  });
  it("rejects inactive tenant", async () => { m.tenant.mockResolvedValue(null); expect(await getCurrentTenantContext()).toBeNull(); });
  it.each(["production", "test"])("never bootstraps in %s", async (env) => {
    vi.stubEnv("NODE_ENV", env); vi.stubEnv("ALLOW_BOOTSTRAP_AUTH", "true"); m.credentials.mockReturnValue(false);
    expect(await getCurrentTenantContext()).toBeNull(); expect(m.bootstrap).not.toHaveBeenCalled();
  });
  it("requires bootstrap opt-in during development", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("ALLOW_BOOTSTRAP_AUTH", "false"); m.credentials.mockReturnValue(false); expect(await getCurrentTenantContext()).toBeNull();
  });
  it("permits explicitly enabled local bootstrap without tenant switching", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("ALLOW_BOOTSTRAP_AUTH", "true"); m.credentials.mockReturnValue(false);
    jar.tenant_override_slug = "b"; m.bootstrap.mockResolvedValue({ id: "tenant-a", name: "A", slug: "a" });
    expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant-a", authMode: "bootstrap", isSuperAdmin: false });
  });
  it("rejects dev cookies in production even with flag enabled", async () => {
    vi.stubEnv("ALLOW_DEV_COOKIE_AUTH", "true"); jar.dev_clerk_client_session = "1"; jar.dev_clerk_user_id = "user_A"; m.auth.mockResolvedValue({ userId: null }); expect(await getCurrentTenantContext()).toBeNull();
  });
  it("requires explicit opt-in for development cookies", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("ALLOW_DEV_COOKIE_AUTH", "false"); jar.dev_clerk_client_session = "1"; jar.dev_clerk_user_id = "user_A"; m.auth.mockResolvedValue({ userId: null });
    expect(await getCurrentTenantContext()).toBeNull(); vi.stubEnv("ALLOW_DEV_COOKIE_AUTH", "true"); expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant-a" });
  });
});
