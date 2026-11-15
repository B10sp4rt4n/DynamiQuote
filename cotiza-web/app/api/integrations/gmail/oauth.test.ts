import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({auth:vi.fn(),begin:vi.fn(),consume:vi.fn(),finish:vi.fn(),exchange:vi.fn(),cookie:vi.fn()}));
vi.mock("@/lib/integrations/gmail/access",async()=>({...await vi.importActual<typeof import("@/lib/integrations/gmail/access")>("@/lib/integrations/gmail/access"),authorizeGmail:m.auth}));
vi.mock("@/lib/auth/tenant-context",()=>({}));vi.mock("@/lib/db/prisma",()=>({}));
vi.mock("@/lib/integrations/gmail/store",()=>({beginAuthorization:m.begin,consumeAuthorization:m.consume,finishAuthorization:m.finish}));
vi.mock("@/lib/integrations/gmail/client",()=>({exchangeToken:m.exchange}));
vi.mock("next/headers",()=>({cookies:async()=>({get:m.cookie})}));
import {gmailTestEnv} from "@/lib/integrations/gmail/test-env";
import {GMAIL_SCOPE} from "@/lib/integrations/gmail/domain";
import {POST as begin} from "./connect/route";
import {GET as callback} from "./callback/route";
const actor={tenantId:"one",actorId:"actor"},state="a".repeat(43);
const callbackRequest=()=>new Request(`https://cotiza.test/api/integrations/gmail/callback?code=private-code&state=${state}`);
beforeEach(()=>{gmailTestEnv();vi.resetAllMocks();m.auth.mockResolvedValue(actor);m.cookie.mockReturnValue({value:"b".repeat(43)});m.exchange.mockResolvedValue({access_token:"synthetic"});});
afterEach(()=>vi.unstubAllEnvs());
it("requests only read access with a browser-bound one-use state and secure cookie",async()=>{
  const response=await begin(new Request("https://cotiza.test/api",{method:"POST"})),result=await response.json(),url=new URL(result.url);
  expect(url.origin).toBe("https://accounts.google.com");expect(url.searchParams.get("scope")).toBe(GMAIL_SCOPE);
  expect(url.searchParams.get("access_type")).toBe("offline");expect(url.searchParams.get("include_granted_scopes")).toBe("false");
  expect(m.begin).toHaveBeenCalledWith(actor,expect.stringMatching(/^[\w-]{43}$/),expect.stringMatching(/^[\w-]{43}$/));
  expect(response.headers.get("set-cookie")).toMatch(/__Host-cotiza_gmail=.*Secure.*HttpOnly/i);
});
it("rejects absent browser proof and replay before exchanging a Google code",async()=>{
  m.cookie.mockReturnValue(undefined);expect((await callback(callbackRequest())).headers.get("location")).toContain("connection=failed");
  expect(m.exchange).not.toHaveBeenCalled();m.cookie.mockReturnValue({value:"b".repeat(43)});m.consume.mockRejectedValue(Error("already used"));
  await callback(callbackRequest());expect(m.exchange).not.toHaveBeenCalled();
});
it("rejects a provider denial and session/tenant mismatch without echoing codes",async()=>{
  await callback(new Request(`https://cotiza.test/api/integrations/gmail/callback?error=access_denied&state=${state}`));
  expect(m.exchange).not.toHaveBeenCalled();m.auth.mockRejectedValue(Error("changed company"));
  const response=await callback(callbackRequest());expect(response.headers.get("location")).not.toContain("private-code");expect(m.exchange).not.toHaveBeenCalled();
});
it("connects using the server actor and clears the proof cookie",async()=>{
  const response=await callback(callbackRequest());
  expect(m.consume).toHaveBeenCalledWith(actor,state,"b".repeat(43));expect(m.finish).toHaveBeenCalledWith(actor,state,{access_token:"synthetic"});
  expect(response.headers.get("location")).toBe("https://cotiza.test/configuracion/integraciones/gmail?connection=connected");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
