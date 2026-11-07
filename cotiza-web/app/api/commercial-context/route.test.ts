import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({tenant:vi.fn(),context:vi.fn()}));
vi.mock("@/lib/auth/tenant-context",()=>({getCurrentTenantContext:m.tenant}));
vi.mock("@/lib/db/opportunity-workspace",()=>({getDocumentBusinessContext:m.context}));
import {GET} from "./route";
beforeEach(()=>{vi.clearAllMocks();m.tenant.mockResolvedValue({id:"tenant-a",userId:"seller-a",userRole:"user",isSuperAdmin:false});m.context.mockResolvedValue({opportunityId:"opp-a",quoteId:"q-a"});});
it("uses session scope and disables shared caching",async()=>{const r=await GET(new Request("http://localhost/api/commercial-context?quoteId=q-a"));expect(m.context).toHaveBeenCalledWith("tenant-a","quote","q-a",{userId:"seller-a",canSeeAll:false});expect(r.headers.get("Cache-Control")).toBe("private, no-store");});
it("rejects missing actor, ambiguous identifiers and inaccessible documents",async()=>{for(const query of ["", "quoteId=a&quoteId=b","quoteId=a&proposalId=b"])expect((await GET(new Request("http://localhost/api/commercial-context?"+query))).status).toBe(422);expect(m.context).not.toHaveBeenCalled();m.context.mockResolvedValue(null);expect((await GET(new Request("http://localhost/api/commercial-context?proposalId=foreign"))).status).toBe(404);m.tenant.mockResolvedValue(null);expect((await GET(new Request("http://localhost/api/commercial-context?quoteId=a"))).status).toBe(401);});
