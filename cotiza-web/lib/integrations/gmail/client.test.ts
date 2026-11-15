import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {gmailTestEnv} from "./test-env";
import {readMessage,searchMessages,exchangeToken} from "./client";
import {GMAIL_SCOPE} from "./domain";
const fetchMock=vi.fn();
const encoded=(text:string)=>Buffer.from(text).toString("base64url");
const reply=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{"Content-Type":"application/json"}});
const message=(id="abc1")=>({id,threadId:"same-thread",internalDate:"1794400000000",sizeEstimate:300,
  payload:{partId:"",mimeType:"multipart/mixed",headers:[{name:"Subject",value:"Same subject"},{name:"From",value:"Estela <sender@test>"}],
    parts:[{partId:"0",mimeType:"text/plain",headers:[{name:"Content-Type",value:"text/plain; charset=UTF-8"}],body:{data:encoded("O'Donnell. Also asks about USEBEQ."),size:40}},
      {partId:"1",mimeType:"application/pdf",filename:"proposal.pdf",body:{attachmentId:"attachment",size:4}}]}});
beforeEach(()=>{gmailTestEnv();vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("returns separate message IDs for identical subjects, never expanding an entire thread",async()=>{
  fetchMock.mockResolvedValueOnce(reply({messages:[{id:"abc1"},{id:"abc2"}]}))
    .mockResolvedValueOnce(reply(message("abc1"))).mockResolvedValueOnce(reply(message("abc2")));
  const result=await searchMessages("synthetic-token","subject:Same");
  expect(result.messages.map(m=>m.messageId)).toEqual(["abc1","abc2"]);
  expect(fetchMock.mock.calls.every(([url])=>!String(url).includes("/threads"))).toBe(true);
  expect(String(fetchMock.mock.calls[0][0])).toContain("-in%3Aspam");
});
it("reads one message, retains full source and downloads/hashes each attachment",async()=>{
  fetchMock.mockResolvedValueOnce(reply(message())).mockResolvedValueOnce(reply({data:encoded("%PDF")}));
  const result=await readMessage("synthetic-token","abc1");
  expect(result.snapshot.bodyText).toContain("USEBEQ");expect(result.snapshot.attachments[0].filename).toBe("proposal.pdf");
  expect(Buffer.from(result.snapshot.attachments[0].data,"base64").toString()).toBe("%PDF");
  expect(result.original.payload.parts?.[1].body?.data).toBe(encoded("%PDF"));
  expect(fetchMock.mock.calls.every(([,init])=>init.cache==="no-store"&&init.redirect==="error")).toBe(true);
});
it("renders HTML only as text and keeps scripts out of the projection",async()=>{
  const m=message();m.payload.parts=[{partId:"0",mimeType:"text/html",headers:[],body:{data:encoded('<div>Hello</div><script>steal()</script>'),size:50}}] as typeof m.payload.parts;
  fetchMock.mockResolvedValueOnce(reply(m));const result=await readMessage("token","abc1");
  expect(result.snapshot.bodyFormat).toBe("html_as_text");expect(result.snapshot.bodyText).toContain("Hello");
  expect(result.snapshot.bodyText).not.toContain("steal");expect(result.snapshot.bodyText).not.toContain("<div>");
});
it("rejects oversized content and does not silently omit attachments",async()=>{
  fetchMock.mockResolvedValueOnce(reply({...message(),sizeEstimate:9*1024*1024}));
  await expect(readMessage("token","abc1")).rejects.toMatchObject({status:413});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("requests provider tokens server-side and rejects write scope grants",async()=>{
  fetchMock.mockResolvedValueOnce(reply({access_token:"synthetic",expires_in:3600,token_type:"Bearer",scope:GMAIL_SCOPE}));
  await exchangeToken({grant_type:"authorization_code",code:"synthetic-code"});
  expect(String(fetchMock.mock.calls[0][1].body)).toContain("client_secret=synthetic-secret");
  fetchMock.mockResolvedValueOnce(reply({access_token:"synthetic",expires_in:3600,token_type:"Bearer",scope:GMAIL_SCOPE+" https://www.googleapis.com/auth/gmail.send"}));
  await expect(exchangeToken({grant_type:"refresh_token"})).rejects.toMatchObject({status:422});
});
it("does not leak provider errors and rejects path injection before sending requests",async()=>{
  fetchMock.mockResolvedValueOnce(new Response("synthetic-secret-provider-error",{status:403}));
  await expect(readMessage("token","abc1")).rejects.toThrow("Google requiere");
  fetchMock.mockReset();await expect(readMessage("token","../profile")).rejects.toMatchObject({status:422});
  expect(fetchMock).not.toHaveBeenCalled();
});
