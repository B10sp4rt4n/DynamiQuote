import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), tenant: vi.fn(), member: vi.fn(), active: vi.fn(), capability: vi.fn(), business: vi.fn(),
  raw: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.capability }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/db/opportunity-workspace", () => ({ resolveBusiness: m.business }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {tenant:{findFirst:m.active},app_users:{findFirst:m.member},$queryRaw:m.raw} }));
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { authorizeRecordia, recordiaPilotVisible } from "./access";
import { handleRecordiaMcp } from "./mcp";
import { readRecordiaDossier, projectPersistentMemory, type MemoryRow } from "./reader";
import { RECORDIA_PILOT_TENANT_ID as tid } from "./domain";
const actor = { tenantId: tid, actorId: "reader" };
const viewer = { id: tid, slug: "sys", authMode: "clerk", isSuperAdmin: true, userId: "reader" };
const time = new Date("2026-11-16T06:00:00Z");
const endpoint = "https://cotiza.test/api/opportunities/opp-a/recordia/mcp";
const headers = { Origin: "https://cotiza.test", "X-Tenant-Context": tid };
function fixtureRows():MemoryRow[] {
  let previous:string|null=null,hash="0".repeat(64);
  const rows:MemoryRow[]=[];
  for(let v=1;v<=3;v++){
    const id=`00000000-0000-4000-8000-00000000000${v}`;
    const before=v===1?null:{note:v===2?"Original note":"Corrected note"};
    const after=v===3?null:{note:v===1?"Original note":"Corrected note"};
    const row={event_id:id,event_number:String(v),source_table:"interaction_logs",source_id:"note-a",source_version:v,
      event_type:v===1?"baseline.observed":v===2?"source.updated":"source.deleted",case_ids:["opp-a"],
      recorded_at_utc:time.toISOString(),source_timestamp_raw:null,actor_id:null,actor_identity_status:"unknown" as const,
      recorder_db_role:"synthetic",before_data:before,after_data:after,previous_event_id:previous,previous_hash:hash,
      parent_hash:previous?hash:null,canonical_text:"",content_hash:""};
    row.canonical_text=JSON.stringify({...row,tenant_id:tid});row.content_hash=createHash("sha256").update(row.canonical_text).digest("hex");
    rows.push(row);previous=id;hash=row.content_hash;
  }
  return rows.reverse();
}
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs();
  vi.stubEnv("COTIZA_RECORDIA_ENABLED", "true"); vi.stubEnv("COTIZA_RECORDIA_VALID_UNTIL", "2099-01-01T00:00:00Z");
  vi.stubEnv("COTIZA_RECORDIA_APP_ORIGIN", "https://cotiza.test");
  m.auth.mockResolvedValue({ userId: "reader" }); m.tenant.mockResolvedValue(viewer);
  m.member.mockResolvedValue({ role: "superadmin" }); m.active.mockResolvedValue({ tenant_id: tid }); m.capability.mockResolvedValue(true);
  m.business.mockResolvedValue({ ids: ["opp-a"], opportunity: { opportunityId: "opp-a" } });
  m.raw.mockImplementation(async (query) => {
    const values=query.values as unknown[];
    if(query.sql.includes("WITH selected")) return [{events:3,valid:true}];
    const eventId=values.find(v=>typeof v==="string" && v.startsWith("00000000-"));
    const cursor=values.find(v=>typeof v==="string" && /^\d+$/.test(v));
    const rows=fixtureRows().filter(r=>(!eventId||r.event_id===eventId)&&(!cursor||BigInt(r.event_number)<BigInt(String(cursor))));
    return rows.slice(Number(values.at(-1)),Number(values.at(-1))+Number(values.at(-2)));
  });
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
  expect(m.raw).not.toHaveBeenCalled();
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
    const tools = (await client.listTools()).tools; expect(tools).toHaveLength(4); expect(tools.every(t => t.annotations?.readOnlyHint)).toBe(true);
    const result = await client.callTool({ name: "recordia_list_memories", arguments: { limit: 2 } });
    expect(result.isError).not.toBe(true);
    const page = JSON.parse((result.content as { text: string }[])[0].text);
    expect(page.items).toHaveLength(2); expect(page.next_offset).toBe(2); expect(page.premium).toBe(true);
    const evidence = await client.callTool({ name: "recordia_get_evidence", arguments: { evidence_id: page.items[0].evidence_ids[0] } });
    const value = JSON.parse((evidence.content as { text: string }[])[0].text);
    expect(value.content_hash).toMatch(/^[a-f0-9]{64}$/); expect(value.integrity_status).toBe("hash_verified");
  } finally { await client.close(); }
});
it.each([{ tenant_id: "other" }, { premium: true }, { limit: 101 }, { limit: "2" }, { offset: -1 }])("rejects forged identity/plan and invalid bounds: %j", async args => {
  const client = await connect();
  try { const result = await client.callTool({ name: "recordia_list_memories", arguments: args }); expect(result.isError).toBe(true); expect(m.raw).not.toHaveBeenCalled(); }
  finally { await client.close(); }
});
it("applies commercial revocation to an already connected client", async () => {
  const client = await connect();
  try { m.capability.mockResolvedValue(false); await expect(client.callTool({ name: "recordia_list_memories", arguments: {} })).rejects.toThrow(); expect(m.raw).not.toHaveBeenCalled(); }
  finally { await client.close(); }
});
it("does not release results when access is revoked while reading", async () => {
  const client=await connect();
  try { m.raw.mockImplementation(async()=>{m.capability.mockResolvedValue(false);return fixtureRows();});
    await expect(client.callTool({name:"recordia_list_memories",arguments:{}})).rejects.toThrow("Piloto Recordia no disponible");
  } finally {await client.close();}
});
it("scopes persisted queries by the fixed tenant and historical case, without reading mutable source tables",async()=>{
  m.business.mockResolvedValue(null);
  const dossier=await readRecordiaDossier(actor,"opp-a");expect(dossier.projected).toHaveLength(3);
  expect(m.raw.mock.calls[0][0].values).toContain(tid);expect(m.raw.mock.calls[0][0].values).toContain("opp-a");
  expect(m.raw.mock.calls[0][0].sql).toContain("recordia_memory_events");
});
it("retains the original snapshot after its live source was deleted",async()=>{
  m.business.mockResolvedValue(null);
  const data=await readRecordiaDossier(actor,"opp-a",{eventId:"00000000-0000-4000-8000-000000000001"});
  expect(data.projected[0].memory.preserved_snapshot?.canonical_text).toContain("Original note");
  expect(data.projected[0].memory.source.href).toBeNull();
});
it("denies a case with no preserved records",async()=>{
  m.business.mockResolvedValue(null);m.raw.mockResolvedValue([]);
  await expect(readRecordiaDossier(actor,"foreign")).rejects.toMatchObject({status:404});
});
it("rejects a tampered envelope and a wrong predecessor",()=>{
  const row=fixtureRows()[1];
  expect(()=>projectPersistentMemory("opp-a",{...row,canonical_text:row.canonical_text+"tamper"})).toThrow("integridad");
  expect(()=>projectPersistentMemory("opp-a",{...row,parent_hash:"f".repeat(64)})).toThrow("integridad");
});
it("does not allow the same valid envelope to be attached to another case",()=>{
  expect(()=>projectPersistentMemory("foreign",fixtureRows()[0])).toThrow("inconsistente");
});
it("uses a stable event-number cursor when new records arrive between pages",async()=>{
  const first=await readRecordiaDossier(actor,"opp-a",{limit:1});expect(first.next_cursor).toBe("3");
  const second=await readRecordiaDossier(actor,"opp-a",{limit:1,beforeEventNumber:first.next_cursor!});
  expect(second.projected[0].memory.id).not.toBe(first.projected[0].memory.id);
});
