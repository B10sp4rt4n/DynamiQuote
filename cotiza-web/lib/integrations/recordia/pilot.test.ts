import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), tenant: vi.fn(), member: vi.fn(), active: vi.fn(), capability: vi.fn(), business: vi.fn(),
  opportunities: vi.fn(), quotes: vi.fn(), proposals: vi.fn(), notes: vi.fn(), events: vi.fn(), approvals: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.capability }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/db/opportunity-workspace", () => ({ resolveBusiness: m.business }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  tenant: { findFirst: m.active }, app_users: { findFirst: m.member }, opportunities: { findMany: m.opportunities }, quote: { findMany: m.quotes },
  proposals: { findMany: m.proposals }, interaction_logs: { findMany: m.notes }, proposal_audit_events: { findMany: m.events }, proposal_approvals: { findMany: m.approvals },
} }));
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { authorizeRecordia, recordiaPilotVisible } from "./access";
import { handleRecordiaMcp } from "./mcp";
import { readRecordiaDossier, projectRecordiaSource } from "./reader";
import { RECORDIA_PILOT_TENANT_ID as tid } from "./domain";
const actor = { tenantId: tid, actorId: "reader" };
const viewer = { id: tid, slug: "sys", authMode: "clerk", isSuperAdmin: true, userId: "reader" };
const time = new Date("2026-11-16T06:00:00Z");
const endpoint = "https://cotiza.test/api/opportunities/opp-a/recordia/mcp";
const headers = { Origin: "https://cotiza.test", "X-Tenant-Context": tid };
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs();
  vi.stubEnv("COTIZA_RECORDIA_ENABLED", "true"); vi.stubEnv("COTIZA_RECORDIA_VALID_UNTIL", "2099-01-01T00:00:00Z");
  vi.stubEnv("COTIZA_RECORDIA_APP_ORIGIN", "https://cotiza.test");
  m.auth.mockResolvedValue({ userId: "reader" }); m.tenant.mockResolvedValue(viewer);
  m.member.mockResolvedValue({ role: "superadmin" }); m.active.mockResolvedValue({ tenant_id: tid }); m.capability.mockResolvedValue(true);
  m.business.mockResolvedValue({ ids: ["opp-a"], opportunity: { opportunityId: "opp-a" } });
  m.opportunities.mockResolvedValue([{ opportunity_id: "opp-a", opportunity_number: "OPP-TEST", created_at: time, closed_at: null }]);
  m.quotes.mockResolvedValue([{ quote_id: "quote-a", quote_group_id: "COT-TEST", version: 1, createdAt: time, created_by_user_id: "reader" }]);
  m.proposals.mockResolvedValue([{ proposal_id: "proposal-a", created_at: time, created_by_user_id: "reader" }]);
  m.notes.mockResolvedValue([{ interaction_id: "note-a", created_at: time, note: "Declaración de prueba <script>no ejecutar</script>", created_by_user_id: "reader" }]);
  m.events.mockResolvedValue([{ event_id: "event-a", event_type: "document_issued", proposal_id: "proposal-a", created_at: time }]);
  m.approvals.mockResolvedValue([{ approval_id: "approval-a", proposal_id: "proposal-a", approver_user_id: "reader", decision: "approved", created_at: time }]);
});
async function connect() {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers }, fetch: async (input, init) => {
    const req = new Request(input, init);
    return handleRecordiaMcp(req, "opp-a");
  } });
  const client = new Client({ name: "recordia-pilot-test", version: "1" });
  await client.connect(transport); return client;
}
const callRequest = (extra: Record<string, string> = {}) => new Request(endpoint, { method: "POST", headers: { ...headers, ...extra } });

it("hides the pilot for every other tenant even when premium is mistakenly enabled there", async () => {
  expect(await recordiaPilotVisible({ ...viewer, id: "other", slug: "salsa" })).toBe(false);
  m.tenant.mockResolvedValue({ ...viewer, id: "other", slug: "salsa" });
  await expect(authorizeRecordia(callRequest())).rejects.toMatchObject({ status: 404 });
  expect(m.opportunities).not.toHaveBeenCalled();
});
it.each(["false", ""]) ("defaults off for feature value '%s'", async value => {
  vi.stubEnv("COTIZA_RECORDIA_ENABLED", value); expect(await recordiaPilotVisible(viewer)).toBe(false);
  await expect(authorizeRecordia(callRequest())).rejects.toMatchObject({ status: 404 });
});
it.each(["", "2000-01-01T00:00:00Z", "2099-01-01T00:00:00", "invalid"]) ("requires current timezone-aware commercial validity: %s", async value => {
  vi.stubEnv("COTIZA_RECORDIA_VALID_UNTIL", value); expect(await recordiaPilotVisible(viewer)).toBe(false);
});
it("requires a signed Clerk identity, not bootstrap or tenant headers", async () => {
  m.auth.mockResolvedValue({ userId: null }); await expect(authorizeRecordia(callRequest())).rejects.toMatchObject({ status: 401 });
  m.auth.mockResolvedValue({ userId: "reader" }); m.tenant.mockResolvedValue({ ...viewer, authMode: "bootstrap" });
  await expect(authorizeRecordia(callRequest())).rejects.toMatchObject({ status: 401 });
});
it.each(["owner", "admin", "user"]) ("does not grant the private pilot to role %s", async role => {
  m.member.mockResolvedValue({ role }); await expect(authorizeRecordia(callRequest())).rejects.toMatchObject({ status: 404 });
});
it("requires the entitlement in addition to superadmin and denies tenant switching and foreign origins", async () => {
  m.capability.mockResolvedValue(false); await expect(authorizeRecordia(callRequest())).rejects.toMatchObject({ status: 404 });
  m.capability.mockResolvedValue(true);
  await expect(authorizeRecordia(callRequest({ "X-Tenant-Context": "other" }))).rejects.toMatchObject({ status: 409 });
  await expect(authorizeRecordia(callRequest({ Origin: "https://attacker.test" }))).rejects.toMatchObject({ status: 403 });
});
it("uses a real MCP client/HTTP transport to list, read and follow evidence", async () => {
  const client = await connect();
  try {
    const tools = (await client.listTools()).tools; expect(tools).toHaveLength(3); expect(tools.every(t => t.annotations?.readOnlyHint)).toBe(true);
    const result = await client.callTool({ name: "recordia_list_memories", arguments: { limit: 2 } });
    expect(result.isError).not.toBe(true);
    const page = JSON.parse((result.content as { text: string }[])[0].text);
    expect(page.items).toHaveLength(2); expect(page.next_offset).toBe(2); expect(page.premium).toBe(true);
    const evidence = await client.callTool({ name: "recordia_get_evidence", arguments: { evidence_id: page.items[0].evidence_ids[0] } });
    const value = JSON.parse((evidence.content as { text: string }[])[0].text);
    expect(value.projection_hash).toMatch(/^[a-f0-9]{64}$/); expect(value.integrity_status).toBe("not_verified");
  } finally { await client.close(); }
});
it.each([{ tenant_id: "other" }, { premium: true }, { limit: 101 }, { limit: "2" }, { offset: -1 }])("rejects forged identity/plan and invalid bounds: %j", async args => {
  const client = await connect();
  try { const result = await client.callTool({ name: "recordia_list_memories", arguments: args }); expect(result.isError).toBe(true); expect(m.opportunities).not.toHaveBeenCalled(); }
  finally { await client.close(); }
});
it("applies commercial revocation to an already connected client", async () => {
  const client = await connect();
  try { m.capability.mockResolvedValue(false); await expect(client.callTool({ name: "recordia_list_memories", arguments: {} })).rejects.toThrow(); expect(m.opportunities).not.toHaveBeenCalled(); }
  finally { await client.close(); }
});
it("does not release results when access is revoked while reading", async () => {
  const client = await connect();
  try {
    m.notes.mockImplementation(async () => { m.capability.mockResolvedValue(false); return []; });
    await expect(client.callTool({ name: "recordia_list_memories", arguments: {} })).rejects.toThrow("Piloto Recordia no disponible");
  } finally { await client.close(); }
});
it("filters every source by the fixed tenant and the authorized opportunity/proposals", async () => {
  const result = await readRecordiaDossier(actor, "opp-a"); expect(result.projected).toHaveLength(6);
  for (const query of [m.opportunities, m.proposals, m.notes, m.events, m.approvals]) expect(query.mock.calls[0][0].where.tenant_id).toBe(tid);
  expect(m.quotes.mock.calls[0][0].where).toEqual({ tenantId: tid, opportunity_id: { in: ["opp-a"] } });
  expect(m.events.mock.calls[0][0].where.proposal_id.in).toEqual(["proposal-a"]);
  expect(result.projected.find(p => p.memory.source.kind === "interaction")?.memory.epistemic_status).toBe("recorded_claim");
  expect(result.projected.find(p => p.memory.source.kind === "approval")?.memory.epistemic_status).toBe("decision");
});
it("rejects foreign or unauthorized dossiers before querying source records", async () => {
  m.business.mockResolvedValue(null); await expect(readRecordiaDossier(actor, "foreign")).rejects.toMatchObject({ status: 404 }); expect(m.quotes).not.toHaveBeenCalled();
});
it("does not find a record from another dossier even with a known identifier", async () => {
  const client = await connect();
  try { expect((await client.callTool({ name: "recordia_get_memory", arguments: { memory_id: "quote_created:foreign" } })).isError).toBe(true); }
  finally { await client.close(); }
});
it("preserves unknown timestamps and makes truncation explicit", async () => {
  m.quotes.mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({ quote_id: `q-${i}`, createdAt: null, version: 1 })));
  const result = await readRecordiaDossier(actor, "opp-a"); expect(result.source_truncated).toBe(true);
  expect(result.projected.filter(p => p.memory.source.kind === "quote_created")).toHaveLength(100);
  expect(result.projected.at(-1)?.memory.recorded_at_utc).toBeNull();
});
it("hashes the projection deterministically without claiming original-source verification", () => {
  const source = { kind: "note", id: "synthetic", time, title: "Test" };
  expect(projectRecordiaSource("opp-a", source)).toEqual(projectRecordiaSource("opp-a", source));
  expect(projectRecordiaSource("opp-a", source).evidence.integrity_status).toBe("not_verified");
});
