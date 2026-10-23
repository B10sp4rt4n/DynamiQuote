import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ context: vi.fn(), credentials: vi.fn(), users: vi.fn(), client: vi.fn(), getUser: vi.fn(), invitations: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.context }));
vi.mock("@/lib/auth/clerk", () => ({ hasClerkCredentials: m.credentials }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { app_users: { findMany: m.users } } }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: m.client }));
import { GET } from "./route";

const local = { user_id: "user_exact", alias: "seller", role: "user", email: "seller@example.com", tenant_id: "tenant-a", tenants: { slug: "a" } };
const identity = { id: "user_exact", banned: false, locked: false, emailAddresses: [{ emailAddress: local.email, verification: { status: "verified" } }] };
beforeEach(() => {
  vi.resetAllMocks(); m.context.mockResolvedValue({ isSuperAdmin: true }); m.credentials.mockReturnValue(true);
  m.users.mockResolvedValue([local]); m.client.mockResolvedValue({ users: { getUser: m.getUser }, invitations: { getInvitationList: m.invitations } });
  m.getUser.mockResolvedValue(identity); m.invitations.mockResolvedValue({ data: [], totalCount: 0 });
});

describe("read-only identity audit", () => {
  it.each([null, { isSuperAdmin: false }])("denies unprivileged caller before DB/provider %j", async (context) => {
    m.context.mockResolvedValue(context); const response = await GET();
    expect(response.status).toBe(context ? 403 : 401); expect(m.users).not.toHaveBeenCalled(); expect(m.client).not.toHaveBeenCalled();
  });
  it("finds exact provider ID without exposing emails or credentials", async () => {
    const response = await GET(); const result = await response.json();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(result.users[0]).toMatchObject({ user_id: local.user_id, status: "exact_id_found", verified_email_matches_local: true });
    expect(JSON.stringify(result)).not.toContain(local.email); expect(m.getUser).toHaveBeenCalledExactlyOnceWith(local.user_id);
    expect(m.invitations).not.toHaveBeenCalled();
  });
  it.each([
    [{ ...identity, id: "user_foreign" }, "provider_id_mismatch"],
    [{ ...identity, banned: true }, "provider_banned"],
    [{ ...identity, locked: true }, "provider_locked"],
  ])("reports provider state without granting access %j", async (value, status) => {
    m.getUser.mockResolvedValue(value); expect((await (await GET()).json()).users[0].status).toBe(status);
  });
  it("reports unverified email without claiming it is the local contact", async () => {
    m.getUser.mockResolvedValue({ ...identity, emailAddresses: [{ emailAddress: local.email, verification: { status: "unverified" } }] });
    expect((await (await GET()).json()).users[0].verified_email_matches_local).toBe(false);
  });
  it.each([[404, "provider_not_found"], [429, "provider_lookup_failed"], [503, "provider_lookup_failed"]])("distinguishes missing from unavailable provider %s", async (status, expected) => {
    m.getUser.mockRejectedValue({ status }); expect((await (await GET()).json()).users[0].status).toBe(expected);
  });
  it("leaves pending and legacy identities unresolved and checks invitation metadata exactly", async () => {
    m.users.mockResolvedValue([{ ...local, user_id: "pending_a" }, { ...local, user_id: "legacy-id" }]);
    m.invitations.mockResolvedValue({ totalCount: 2, data: [
      { publicMetadata: { localUserId: "pending_a", tenantId: "tenant-foreign" }, emailAddress: local.email },
      { publicMetadata: { localUserId: "pending_a", tenantId: "tenant-a" }, emailAddress: local.email },
    ] });
    const result = await (await GET()).json();
    expect(result.users[0]).toMatchObject({ status: "pending_local_id", invitation_matches: 1, invitation_email_matches_local: true });
    expect(result.users[1]).toMatchObject({ status: "legacy_local_id", provider_lookup: "not_attempted" }); expect(m.getUser).not.toHaveBeenCalled();
  });
  it("does not claim invitation absence from an incomplete page", async () => {
    m.users.mockResolvedValue([{ ...local, user_id: "pending_a" }]); m.invitations.mockResolvedValue({ data: [], totalCount: 101 });
    const result = await (await GET()).json(); expect(result.invitations_complete).toBe(false); expect(result.users[0].invitation_search_complete).toBe(false);
  });
  it("does not query provider without credentials", async () => {
    m.credentials.mockReturnValue(false); expect((await GET()).status).toBe(503); expect(m.client).not.toHaveBeenCalled();
  });
  it("returns 503 if provider initialization fails", async () => {
    m.client.mockRejectedValue(new Error("private secret detail")); const response = await GET();
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private secret detail");
  });
});
