import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), business: vi.fn(), proposals: vi.fn(), event: vi.fn(), audit: vi.fn(), users: vi.fn(), quotes: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/opportunity-workspace", () => ({ resolveBusiness: m.business }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { proposals: { findMany: m.proposals }, quote: { findMany: m.quotes }, proposal_audit_events: { findFirst: m.event, create: m.audit } } }));
vi.mock("@/lib/db/won-notifications", () => ({ wonPolicyUsers: m.users }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: () => ({ allowed: true }) }));
import { GET } from "./route";
const context = { params: Promise.resolve({ opportunityId: "o" }) };
const request = (suffix = "") => new Request(`https://cotiza.example/api/opportunities/o/won-event${suffix}`);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("COTIZA_WON_EVENT_PILOT", "true");
  m.tenant.mockResolvedValue({ id: "t", userId: "salvador", userRole: "admin", isSuperAdmin: false });
  m.business.mockResolvedValue({ ids: ["o"] }); m.proposals.mockResolvedValue([{ proposal_id: "p" }]); m.quotes.mockResolvedValue([]);
  m.event.mockResolvedValue({ event_id: "e", proposal_id: "p", payload: JSON.stringify({ opportunity_id: "o", closed_on: "2026-08-28", occurred_at: "2026-11-07T18:00:00Z",
    opportunity: { folio: "OPP-0042", title: "Demo", customer: { name: "Demo client" }, winning_proposal: { amount: "100.0000", currency: "MXN" } },
    notification: { recipients: [
      { user_id: "salvador", reasons: ["opportunity_owner", "tenant_designated"], channels: ["in_app", "email"] },
      { user_id: "another", reasons: ["tenant_designated"], channels: ["in_app", "email"] },
    ] } }) });
  m.users.mockResolvedValue([{ user_id: "salvador", email: "salvador@example.com" }, { user_id: "another", email: "another@example.com" }]);
});
afterEach(() => vi.unstubAllEnvs());
it("rejects anonymous requests", async () => { m.tenant.mockResolvedValue(null); expect((await GET(request(), context)).status).toBe(401); expect(m.event).not.toHaveBeenCalled(); });
it("does not read a foreign or invisible business", async () => { m.business.mockResolvedValue(null); expect((await GET(request(), context)).status).toBe(404); expect(m.event).not.toHaveBeenCalled(); });
it("consolidates owner and administrator in the preview without sending", async () => {
  const response = await GET(request(), context); const body = await response.json();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(body.mode).toBe("dry_run"); expect(body.emails).toHaveLength(2);
  expect(body.emails[0].reasons).toHaveLength(2); expect(body.inApp.filter((r: { userId: string }) => r.userId === "salvador")).toHaveLength(1);
});
it("ordinary users see only their own recipient and mailbox", async () => {
  m.tenant.mockResolvedValue({ id: "t", userId: "salvador", userRole: "user", isSuperAdmin: false });
  const body = await (await GET(request(), context)).json();
  expect(body.event.notification.recipients).toHaveLength(1); expect(body.emails).toHaveLength(1);
  expect(JSON.stringify(body)).not.toContain("another@example.com");
});
it("downloads the stored snapshot and audits the export", async () => {
  const response = await GET(request("?download=1"), context);
  expect(response.headers.get("content-disposition")).toContain("attachment;");
  expect((await response.json()).closed_on).toBe("2026-08-28");
  expect(m.audit.mock.calls[0][0].data).toMatchObject({ tenant_id: "t", event_type: "won_event_exported" });
});
