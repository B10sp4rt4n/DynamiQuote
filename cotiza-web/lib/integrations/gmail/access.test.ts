import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({context:vi.fn(),member:vi.fn(),opportunity:vi.fn()}));
vi.mock("@/lib/auth/tenant-context",()=>({getCurrentTenantContext:m.context}));
vi.mock("@/lib/db/prisma",()=>({prisma:{app_users:{findFirst:m.member},opportunities:{findFirst:m.opportunity}}}));
import {authorizeGmail,authorizeGmailTarget} from "./access";
import {gmailTestEnv} from "./test-env";
const actor={id:"one",userId:"actor",isSuperAdmin:true,authMode:"clerk"};
const request=(tenant="one",origin="https://cotiza.test")=>new Request("https://cotiza.test/api/gmail",{method:"POST",headers:{origin,"X-Tenant-Context":tenant}});
beforeEach(()=>{gmailTestEnv();vi.resetAllMocks();m.context.mockResolvedValue(actor);m.member.mockResolvedValue({role:"superadmin"});m.opportunity.mockResolvedValue({client_id:"client"});});
afterEach(()=>vi.unstubAllEnvs());
it("resolves the client inside the authenticated company",async()=>{
  expect(await authorizeGmailTarget(request(),"opp")).toEqual({tenantId:"one",actorId:"actor",opportunityId:"opp",clientId:"client"});
  expect(m.opportunity).toHaveBeenCalledWith(expect.objectContaining({where:{tenant_id:"one",opportunity_id:"opp"}}));
});
it("denies bootstrap, anonymous, disabled tenants and claims without a database superadmin",async()=>{
  for(const context of [null,{...actor,authMode:"bootstrap"},{...actor,id:"two"},{...actor,isSuperAdmin:false}]) {
    m.context.mockResolvedValue(context);await expect(authorizeGmail(request())).rejects.toBeDefined();
  }
  m.context.mockResolvedValue(actor);m.member.mockResolvedValue({role:"owner"});
  await expect(authorizeGmail(request())).rejects.toMatchObject({status:403});
});
it("rejects foreign origins and a changed active company",async()=>{
  await expect(authorizeGmail(request("two"))).rejects.toMatchObject({status:409});
  await expect(authorizeGmail(request("one","https://evil.test"))).rejects.toMatchObject({status:403});
});
it("does not let missing or cross-tenant opportunities reach Gmail",async()=>{
  m.opportunity.mockResolvedValue(null);await expect(authorizeGmailTarget(request(),"foreign")).rejects.toMatchObject({status:404});
});
