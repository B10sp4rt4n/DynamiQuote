import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(), client: vi.fn(), cookies: vi.fn(), credentials: vi.fn(),
  user: vi.fn(), users: vi.fn(), update: vi.fn(), admin: vi.fn(),
  tenant: vi.fn(), bootstrap: vi.fn(), getUser: vi.fn(), metadata: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth, clerkClient: m.client }));
vi.mock("next/headers", () => ({ cookies: m.cookies }));
vi.mock("@/lib/auth/clerk", () => ({ hasClerkCredentials: m.credentials }));
vi.mock("@/lib/db/tenants", () => ({ getBootstrapTenant: m.bootstrap }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  app_users: { findUnique: m.user, findMany: m.users, findFirst: m.admin, update: m.update },
  tenant: { findFirst: m.tenant },
} }));
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
const user = { user_id: "user_known", active: true, alias: "salvador",
  first_name: "Salvador", last_name: "Ruiz", role: "user", tenant_id: "tenant_a" };
let cookieValues: Record<string, string>;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEFAULT_TENANT_SLUG", "empresa-a"); cookieValues = {};
  m.cookies.mockImplementation(async () => ({ get: (name: string) =>
    cookieValues[name] ? { value: cookieValues[name] } : undefined }));
  m.credentials.mockReturnValue(true);
  m.auth.mockResolvedValue({ userId: user.user_id, sessionClaims: {} });
  m.user.mockResolvedValue({ ...user });
  m.tenant.mockResolvedValue({ tenant_id: "tenant_a", name: "Empresa A", slug: "empresa-a" });
  m.admin.mockResolvedValue(null);
  m.users.mockResolvedValue([{ ...user, role: "superadmin" }]);
  m.bootstrap.mockResolvedValue({ id: "tenant_a", name: "Empresa A", slug: "empresa-a" });
  m.client.mockResolvedValue({ users: { getUser: m.getUser, updateUserMetadata: m.metadata } });
});
afterEach(() => vi.unstubAllEnvs());
function expectNoIdentityMutations() {
  expect(m.users).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  expect(m.metadata).not.toHaveBeenCalled();
}
describe("getCurrentTenantContext identity boundary", () => {
  it("denies unknown users despite a single superadmin, matching names and privileged claims", async () => {
    m.auth.mockResolvedValue({ userId: "user_stranger", sessionClaims: {
      name: "Salvador Ruiz", email: "salvador@other-domain.example",
      first_name: "Salvador", last_name: "Ruiz",
      metadata: { role: "superadmin", tenantId: "tenant_a" },
    } }); m.user.mockResolvedValue(null);
    expect(await getCurrentTenantContext()).toBeNull();
    expect(m.user).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: "user_stranger" } }));
    expectNoIdentityMutations(); expect(m.client).not.toHaveBeenCalled();
    expect(m.bootstrap).not.toHaveBeenCalled();
  });
  it("denies inactive users before tenant resolution or metadata sync", async () => {
    m.user.mockResolvedValue({ ...user, active: false, role: "superadmin" });
    expect(await getCurrentTenantContext()).toBeNull();
    expect(m.tenant).not.toHaveBeenCalled(); expect(m.client).not.toHaveBeenCalled();
    expectNoIdentityMutations();
  });
  it("denies missing sessions and forged development cookies in production", async () => {
    m.auth.mockResolvedValue({ userId: null, sessionClaims: null });
    cookieValues = { dev_clerk_client_session: "1", dev_clerk_user_id: user.user_id };
    expect(await getCurrentTenantContext()).toBeNull(); expect(m.user).not.toHaveBeenCalled();
  });
  it.each(["production", "test"])("denies missing Clerk credentials in %s", async (environment) => {
    vi.stubEnv("NODE_ENV", environment); m.credentials.mockReturnValue(false);
    cookieValues.tenant_override_slug = "empresa-b";
    expect(await getCurrentTenantContext()).toBeNull(); expect(m.auth).not.toHaveBeenCalled();
    expect(m.bootstrap).not.toHaveBeenCalled(); expect(m.tenant).not.toHaveBeenCalled();
  });
  it("preserves anonymous bootstrap only in local development", async () => {
    vi.stubEnv("NODE_ENV", "development"); m.credentials.mockReturnValue(false);
    expect(await getCurrentTenantContext()).toMatchObject({ authMode: "bootstrap", userRole: "user", isSuperAdmin: false });
    expect(m.auth).not.toHaveBeenCalled();
  });
  it("ignores conflicting roles, membership claims and ordinary-user tenant overrides", async () => {
    cookieValues.tenant_override_slug = "empresa-b";
    m.auth.mockResolvedValue({ userId: user.user_id, sessionClaims: {
      metadata: { role: "superadmin", tenantId: "tenant_b" },
      publicMetadata: { role: "owner", tenantSlug: "empresa-b" },
      unsafeMetadata: { role: "root", tenantId: "tenant_b" }, org_slug: "empresa-b",
    } });
    expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant_a", userId: user.user_id,
      userRole: "user", isSuperAdmin: false, accessScope: "subtenant" });
    expect(m.tenant).toHaveBeenCalledOnce();
    expect(m.tenant).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true, tenant_id: "tenant_a" } }));
    expectNoIdentityMutations();
  });
  it("denies ordinary users without a local tenant despite a default tenant", async () => {
    m.user.mockResolvedValue({ ...user, tenant_id: null });
    expect(await getCurrentTenantContext()).toBeNull(); expect(m.bootstrap).not.toHaveBeenCalled();
  });
  it("denies inactive or missing tenants without a default fallback", async () => {
    m.tenant.mockResolvedValue(null);
    expect(await getCurrentTenantContext()).toBeNull(); expect(m.bootstrap).not.toHaveBeenCalled();
  });
  it("preserves owner access and primary administrator identification", async () => {
    m.user.mockResolvedValue({ ...user, role: "owner" });
    m.admin.mockResolvedValue({ user_id: user.user_id });
    expect(await getCurrentTenantContext()).toMatchObject({ userRole: "owner", isTenantPrimaryAdmin: true, isSuperAdmin: false });
  });
  it("allows linked active superadmins to select an active tenant", async () => {
    m.user.mockResolvedValue({ ...user, role: "superadmin" }); cookieValues.tenant_override_slug = "empresa-b";
    m.tenant.mockResolvedValue({ tenant_id: "tenant_b", name: "Empresa B", slug: "empresa-b" });
    expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant_b", userRole: "superadmin", accessScope: "global" });
  });
  it("denies invalid superadmin overrides without silently choosing another tenant", async () => {
    m.user.mockResolvedValue({ ...user, role: "superadmin" }); cookieValues.tenant_override_slug = "missing";
    m.tenant.mockResolvedValue(null);
    expect(await getCurrentTenantContext()).toBeNull(); expect(m.bootstrap).not.toHaveBeenCalled();
  });
  it("permits a linked platform superadmin without a home tenant to select the default", async () => {
    m.user.mockResolvedValue({ ...user, role: "superadmin", tenant_id: null });
    expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant_a", isSuperAdmin: true });
  });
  it("requires an exact active ID for synthetic local sessions", async () => {
    vi.stubEnv("NODE_ENV", "development"); m.auth.mockResolvedValue({ userId: null, sessionClaims: null });
    cookieValues = { dev_clerk_client_session: "1", dev_clerk_user_id: user.user_id,
      dev_clerk_tenant_id: "tenant_b", dev_clerk_email_alias: "salvador" };
    expect(await getCurrentTenantContext()).toMatchObject({ id: "tenant_a", userId: user.user_id });
    m.user.mockResolvedValue(null); expect(await getCurrentTenantContext()).toBeNull();
    expectNoIdentityMutations();
  });
});
