import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({raw:vi.fn()}));
vi.mock("@clerk/nextjs/server",()=>({auth:async()=>({userId:"synthetic-reader"})}));
vi.mock("@/lib/auth/tenant-context",()=>({getCurrentTenantContext:async()=>({id:"389b6cc1-2f8d-4fe4-bc3d-f50f92df3157",slug:"sys",authMode:"clerk",userId:"synthetic-reader",isSuperAdmin:true})}));
vi.mock("@/lib/db/tenant-capabilities",()=>({isTenantCapabilityEnabled:async()=>true}));
vi.mock("@/lib/utils/rate-limit",()=>({enforceRateLimit:()=>({allowed:true})}));
vi.mock("@/lib/db/opportunity-workspace",()=>({resolveBusiness:async()=>null}));
vi.mock("@/lib/db/prisma",()=>({prisma:{$queryRaw:m.raw,tenant:{findFirst:async()=>({tenant_id:"389b6cc1-2f8d-4fe4-bc3d-f50f92df3157"})},app_users:{findFirst:async()=>({role:"superadmin"})}}}));
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleRecordiaMcp } from "./mcp";
import type { RecordiaPage } from "./domain";
import { groupRecordiaTimeline } from "./timeline";
const integration=process.env.PGLITE_MODULE?it:it.skip;
integration("reads durable PostgreSQL versions via a real MCP HTTP client, after source deletion and process restart",async()=>{
  const name=process.env.PGLITE_MODULE!;
  const {PGlite}=await import(name);
  const directory=await mkdtemp(join(tmpdir(),"recordia-persistent-test-"));
  let db=new PGlite(directory);
  const root=new URL("../../../../",import.meta.url);
  const fixture=await readFile(new URL("scripts/recordia/fixture.sql",root),"utf8");
  const migration=await readFile(new URL("cotiza-web/prisma/manual/20261116_recordia_persistent_memory.sql",root),"utf8");
  vi.stubEnv("COTIZA_RECORDIA_ENABLED","true");vi.stubEnv("COTIZA_RECORDIA_VALID_UNTIL","2099-01-01T00:00:00Z");vi.stubEnv("COTIZA_RECORDIA_APP_ORIGIN","https://cotiza.test");
  let client:Client|undefined;
  const payload=(result:Awaited<ReturnType<Client["callTool"]>>)=>JSON.parse((result.content as {text:string}[])[0].text);
  try {
    await db.exec(fixture);
    await db.exec(`ALTER TABLE formal_proposals ADD COLUMN proposal_number text;
      ALTER TABLE proposal_audit_events ADD COLUMN event_type text;
      UPDATE formal_proposals SET proposal_number='PROP-A' WHERE proposal_doc_id='doc-a';`);
    await db.exec(`BEGIN;${migration}COMMIT;`);
    m.raw.mockImplementation(async(query)=>{const result=await db.query(query.text,query.values);return result.rows;});
    async function connect(){
      const c=new Client({name:"recordia-real-postgresql-test",version:"1"});
      await c.connect(new StreamableHTTPClientTransport(new URL("https://cotiza.test/api/opportunities/case-a/recordia/mcp"),{
        requestInit:{headers:{Origin:"https://cotiza.test","X-Tenant-Context":"389b6cc1-2f8d-4fe4-bc3d-f50f92df3157"}},
        fetch:async(input,init)=>handleRecordiaMcp(new Request(input,init),"case-a"),
      }));return c;
    }
    client=await connect();
    const first=payload(await client.callTool({name:"recordia_list_memories",arguments:{limit:2}}));
    expect(first.items).toHaveLength(2);expect(first.next_cursor).toBeTruthy();expect(first.persistent).toBe(true);
    const tenantId = "389b6cc1-2f8d-4fe4-bc3d-f50f92df3157";
    async function recordPdf(id: string, type: string, updatedAt?: string) {
      await db.query(`INSERT INTO proposal_audit_events (event_id, tenant_id, proposal_id, payload, created_at, event_type)
        VALUES ($1, $2, 'proposal-a', $3, now(), $4)`, [id, tenantId, JSON.stringify({
        via: "pdf", status: "approved", ...(updatedAt ? { documentId: "doc-a", documentUpdatedAt: updatedAt } : {}),
      }), type]);
    }
    await recordPdf("historic-first", "document_issued");
    await recordPdf("historic-second", "document_issued");
    await db.exec("UPDATE formal_proposals SET proposal_number='PROP-A-REV' WHERE proposal_doc_id='doc-a'");
    await recordPdf("historic-next-version", "document_issued");
    await recordPdf("download-first", "document_downloaded", "2026-11-21T12:00:00Z");
    await recordPdf("download-second", "document_downloaded", "2026-11-21T12:00:00Z");
    await recordPdf("download-next-version", "document_downloaded", "2026-11-21T12:01:00Z");
    const downloads = payload(await client.callTool({ name: "recordia_list_memories", arguments: { limit: 100 } })) as RecordiaPage;
    const grouped = groupRecordiaTimeline(downloads.items).filter(group => group.entry.pdf);
    expect(grouped.map(group => [group.entry.folio, group.records.length])).toEqual([
      ["PROP-A-REV", 1], ["PROP-A-REV", 2], ["PROP-A-REV", 1], ["PROP-A", 2],
    ]);
    await db.exec("UPDATE interaction_logs SET note='Edited after baseline' WHERE interaction_id='note-a'; DELETE FROM interaction_logs WHERE interaction_id='note-a'; DELETE FROM opportunities WHERE opportunity_id='case-a';");
    const second=payload(await client.callTool({name:"recordia_list_memories",arguments:{limit:2,before_event_number:first.next_cursor}}));
    expect(second.items.map((x:{id:string})=>x.id).some((id:string)=>first.items.some((x:{id:string})=>x.id===id))).toBe(false);
    await client.close();await db.close();db=new PGlite(directory);client=await connect();
    const all=payload(await client.callTool({name:"recordia_list_memories",arguments:{limit:100}}));
    expect(all.items.some((x:{context:{event_type:string}})=>x.context.event_type==="source.deleted")).toBe(true);
    const original=all.items.find((x:{description:string|null;context:{event_type:string}})=>x.description==="Original note"&&x.context.event_type==="baseline.observed");
    expect(original).toBeTruthy();
    const saved=payload(await client.callTool({name:"recordia_get_memory",arguments:{memory_id:original.id}}));
    expect(saved.preserved_snapshot.canonical_text).toContain("Original note");expect(saved.integrity_status).toBe("hash_verified");
    const evidence=payload(await client.callTool({name:"recordia_get_evidence",arguments:{evidence_id:original.evidence_ids[0]}}));
    expect(createHash("sha256").update(evidence.canonical_text).digest("hex")).toBe(evidence.content_hash);
    const verified=payload(await client.callTool({name:"recordia_verify_integrity",arguments:{}}));
    expect(verified.valid).toBe(true);expect(verified.events).toBeGreaterThan(6);
    expect((await client.callTool({name:"recordia_get_memory",arguments:{memory_id:"00000000-0000-4000-8000-000000000099"}})).isError).toBe(true);
  }finally{await client?.close();await db.close();await rm(directory,{recursive:true,force:true});vi.unstubAllEnvs();}
},45000);
