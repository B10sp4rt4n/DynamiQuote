import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), tenant: vi.fn(), cap: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findUnique: m.user }, tenant: { findUnique: m.tenant }, tenantCapability: { findUnique: m.cap } } }));
import { getApprovalActor, approvalConfig } from "./verified-authorization";
beforeEach(() => {
  vi.stubEnv("COTIZA_APPROVAL_ENABLED", "true"); vi.stubEnv("COTIZA_APPROVAL_TENANT_ID", "syn"); vi.stubEnv("COTIZA_APPROVAL_ISSUER", "https://clerk.example.test"); vi.stubEnv("COTIZA_APPROVAL_ORIGIN", "https://cotiza.example.test");
  vi.clearAllMocks(); m.auth.mockResolvedValue({ userId: "user_owner", sessionId: "sess_test", sessionClaims: { iss: "https://clerk.example.test" } });
  m.user.mockResolvedValue({ user_id: "user_owner", tenant_id: "syn", role: "owner", active: true });
  m.tenant.mockResolvedValue({ tenant_id: "syn", slug: "sys", name: "SynAppsSys", active: true }); m.cap.mockResolvedValue({ enabled: true });
});
describe("strict Clerk identity for the SynAppsSys pilot", () => {
  it("uses exact local user identity and ignores tenant cookies and metadata", async () => {
    expect(await getApprovalActor()).toMatchObject({ userId: "user_owner", tenantId: "syn", role: "owner" });
    expect(m.user).toHaveBeenCalledWith({ where: { user_id: "user_owner" } });
  });
  it("denies missing configuration before authentication", async () => {
    vi.stubEnv("COTIZA_APPROVAL_ENABLED", "false"); await expect(getApprovalActor()).rejects.toMatchObject({ status: 404 }); expect(m.auth).not.toHaveBeenCalled();
  });
  it.each([null, { userId: null }, { userId: "user_owner", sessionId: "sess", sessionClaims: { iss: "other" } }, { userId: "user_owner", sessionId: "sess", sessionClaims: { iss: "https://clerk.example.test", sts: "pending" } }])("denies absent or invalid session", async session => {
    m.auth.mockResolvedValue(session ?? {}); await expect(getApprovalActor()).rejects.toMatchObject({ status: 401 });
  });
  it.each([null, { user_id: "user_other", tenant_id: "syn", active: true }, { user_id: "user_owner", tenant_id: "other", active: true, role: "superadmin" }, { user_id: "user_owner", tenant_id: "syn", active: false }])("denies unlinked, disabled and cross-tenant users", async member => {
    m.user.mockResolvedValue(member); await expect(getApprovalActor()).rejects.toMatchObject({ status: 403 });
  });
  it("requires both SynAppsSys and its explicit entitlement", async () => {
    m.cap.mockResolvedValue(null); await expect(getApprovalActor()).rejects.toMatchObject({ status: 403 });
    m.cap.mockResolvedValue({ enabled: true }); m.tenant.mockResolvedValue({ tenant_id: "syn", slug: "other", active: true }); await expect(getApprovalActor()).rejects.toMatchObject({ status: 403 });
  });
  it("rejects an unstable or insecure relying-party origin", () => {
    for (const value of ["http://cotiza.example.test", "https://cotiza.example.test/path", "https://u:p@cotiza.example.test"]) { vi.stubEnv("COTIZA_APPROVAL_ORIGIN", value); expect(() => approvalConfig()).toThrow(); }
  });
});
