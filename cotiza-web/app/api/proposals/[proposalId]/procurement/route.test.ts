import { beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({tenant:vi.fn(),get:vi.fn(),act:vi.fn(),limit:vi.fn()}));
vi.mock("@/lib/auth/tenant-context",()=>({getCurrentTenantContext:m.tenant}));
vi.mock("@/lib/db/won-consolidation",()=>({getProcurementView:m.get,actOnProcurement:m.act,WinError:class extends Error{constructor(message:string,public status=409){super(message);}}}));
vi.mock("@/lib/utils/rate-limit",()=>({enforceRateLimit:m.limit}));
import {GET,POST} from "./route";
const tenant={id:"a",userId:"owner",userRole:"owner",isSuperAdmin:false,authMode:"clerk"};
const context={params:Promise.resolve({proposalId:"p"})};
const body={action:"prepare",expectedWinRevision:3,expectedFingerprint:"a".repeat(64)};
function request(value:unknown=body,headers:Record<string,string>={}){return new Request("https://cotiza.test/api/proposals/p/procurement",{
  method:"POST",headers:{origin:"https://cotiza.test","X-Tenant-Context":"a",...headers},body:JSON.stringify(value)});}
beforeEach(()=>{vi.clearAllMocks();m.tenant.mockResolvedValue(tenant);m.limit.mockReturnValue({allowed:true});m.get.mockResolvedValue({tenantId:"a",proposalId:"p",enabled:true,drafts:[]});m.act.mockResolvedValue({tenantId:"a",proposalId:"p",drafts:[]});});
it("requires a live Clerk session for reads and writes",async()=>{
  for(const value of [null,{...tenant,authMode:"development"}]){m.tenant.mockResolvedValue(value);expect((await GET(new Request("https://cotiza.test"),context)).status).toBe(401);expect((await POST(request(),context)).status).toBe(401);}
  expect(m.get).not.toHaveBeenCalled();expect(m.act).not.toHaveBeenCalled();
});
it("pins writes to the current tenant, exact Origin and a validated close",async()=>{
  expect((await POST(request(body,{origin:"https://other.test"}),context)).status).toBe(403);
  expect((await POST(request(body,{"X-Tenant-Context":"b"}),context)).status).toBe(409);
  expect((await POST(request({...body,tenantId:"b"}),context)).status).toBe(422);
  expect(m.act).not.toHaveBeenCalled();
  expect((await POST(request(),context)).status).toBe(200);
  expect(m.act).toHaveBeenCalledWith("a","p",expect.objectContaining({userId:"owner"}),body);
});
it("bounds request size and repeated attempts",async()=>{
  expect((await POST(request(body,{"content-length":"20000"}),context)).status).toBe(413);
  expect((await POST(request({action:"update",notes:"a".repeat(17000)}),context)).status).toBe(413);
  m.limit.mockReturnValue({allowed:false});expect((await POST(request(),context)).status).toBe(429);expect(m.act).not.toHaveBeenCalled();
});
it("reads without mutation or cache and marks an export as an internal draft",async()=>{
  const result=await GET(new Request("https://cotiza.test/api/proposals/p/procurement"),context);
  expect(result.headers.get("cache-control")).toBe("no-store");expect(m.act).not.toHaveBeenCalled();
  m.get.mockResolvedValue({drafts:[{id:"d",folio:"REQ-2026-0001",current:false,state:"review_required"}]});
  const file=await GET(new Request("https://cotiza.test/api/proposals/p/procurement?downloadDraft=d"),context);
  expect(file.headers.get("content-disposition")).toContain("REQ-2026-0001.json");
  expect(await file.json()).toMatchObject({documentKind:"purchase_requisition_draft",executionAllowed:false,draft:{state:"review_required",current:false}});
  expect((await GET(new Request("https://cotiza.test/api/proposals/p/procurement?downloadDraft=other"),context)).status).toBe(404);
});
it("does not expose unexpected database errors",async()=>{
  m.act.mockRejectedValue(new Error("private database detail"));const result=await POST(request(),context);
  expect(result.status).toBe(500);expect(JSON.stringify(await result.json())).not.toContain("private database detail");
});
