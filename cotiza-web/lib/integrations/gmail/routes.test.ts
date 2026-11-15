import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({auth:vi.fn(),list:vi.fn(),connection:vi.fn(),search:vi.fn(),preview:vi.fn(),save:vi.fn(),attachment:vi.fn()}));
vi.mock("./access",async()=>({...await vi.importActual<typeof import("./access")>("./access"),authorizeGmailTarget:m.auth}));
vi.mock("@/lib/auth/tenant-context",()=>({}));vi.mock("@/lib/db/prisma",()=>({}));
vi.mock("./store",()=>({listLinks:m.list,readConnection:m.connection,searchMailbox:m.search,previewMessage:m.preview,saveMessage:m.save,savedAttachment:m.attachment}));
import {gmailTestEnv} from "./test-env";
import {GmailError,type GmailSnapshot} from "./domain";
import {gmailGet,gmailPost} from "./routes";
import {snapshotHash} from "./crypto";
const target={tenantId:"one",actorId:"actor",opportunityId:"opp",clientId:"client"};
const snapshot:GmailSnapshot={messageId:"abc1",threadId:"thread",internetMessageId:"<one@test>",subject:"Same subject",from:"from@test",to:"to@test",cc:"",date:"date",receivedAt:"2026-11-11T12:00:00Z",bodyText:"Approval reported",bodyFormat:"plain",attachments:[],observedAt:"2026-11-15T12:00:00Z"};
const req=(body:unknown)=>new Request("https://cotiza.test/api/opportunities/opp/gmail",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{gmailTestEnv();vi.resetAllMocks();m.auth.mockResolvedValue(target);m.list.mockResolvedValue([]);m.connection.mockResolvedValue(null);
  m.preview.mockResolvedValue({email:"reader@example.test",snapshot});m.save.mockResolvedValue({unchanged:false});});
afterEach(()=>vi.unstubAllEnvs());
it("reads local copies without fetching Gmail and keeps results uncached",async()=>{
  const response=await gmailGet(new Request("https://cotiza.test/api"),"opp");
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
  expect(m.list).toHaveBeenCalledWith(target);expect(m.preview).not.toHaveBeenCalled();expect(m.search).not.toHaveBeenCalled();
});
it("previews without writing then confirms only the server-signed source in the same dossier",async()=>{
  const preview=await(await gmailPost(req({action:"preview",messageId:"abc1"}),"opp")).json();
  expect(m.save).not.toHaveBeenCalled();
  const response=await gmailPost(req({action:"link",messageId:"abc1",previewToken:preview.previewToken}),"opp");
  expect(response.status).toBe(201);expect(m.save).toHaveBeenCalledWith(target,"abc1",snapshotHash(snapshot));
});
it("rejects client-selected identity, injected evidence and unsigned source links",async()=>{
  for(const input of [{action:"search",query:"test",tenantId:"two"},{action:"preview",messageId:"abc1",bodyText:"invented"},
    {action:"link",messageId:"abc1",previewToken:"forged"}]) expect((await gmailPost(req(input),"opp")).status).toBeGreaterThanOrEqual(400);
  expect(m.search).not.toHaveBeenCalled();expect(m.preview).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
it("rejects confirmation after a tenant, actor or opportunity switch",async()=>{
  const preview=await(await gmailPost(req({action:"preview",messageId:"abc1"}),"opp")).json();
  for(const patch of [{tenantId:"two"},{actorId:"other"},{opportunityId:"other"}]) {
    m.auth.mockResolvedValue({...target,...patch});
    expect((await gmailPost(req({action:"link",messageId:"abc1",previewToken:preview.previewToken}),"opp")).status).toBe(409);
  }
  expect(m.save).not.toHaveBeenCalled();
});
it("protects provider and private storage errors and stops before reading on access denial",async()=>{
  m.auth.mockRejectedValue(new GmailError("Denied",403));expect((await gmailGet(new Request("https://cotiza.test/api"),"opp")).status).toBe(403);
  expect(m.list).not.toHaveBeenCalled();m.auth.mockResolvedValue(target);m.preview.mockRejectedValue(Error("synthetic-secret-token"));
  const response=await gmailPost(req({action:"preview",messageId:"abc1"}),"opp");
  expect(response.status).toBe(503);expect(await response.text()).not.toContain("synthetic-secret-token");
});
