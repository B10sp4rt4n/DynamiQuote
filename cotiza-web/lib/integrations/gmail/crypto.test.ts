import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {gmailTestEnv} from "./test-env";
import {seal,unseal,signPreview,verifyPreview,snapshotHash} from "./crypto";
import type {GmailSnapshot} from "./domain";
const target={tenantId:"one",actorId:"actor",clientId:"client",opportunityId:"opp"};
const snapshot:GmailSnapshot={messageId:"abc1",threadId:"thread",internetMessageId:"<one@test>",subject:"Same subject",from:"from@test",to:"to@test",cc:"",date:"date",receivedAt:"2026-11-11T12:00:00Z",bodyText:"Documented approval",bodyFormat:"plain",attachments:[],observedAt:"2026-11-15T12:00:00Z"};
beforeEach(gmailTestEnv);afterEach(()=>vi.unstubAllEnvs());
it("encrypts source material and credentials with a context-bound authenticated key",()=>{
  const encrypted=seal("private evidence","tenant:actor:source");
  expect(encrypted).not.toContain("private evidence");expect(unseal(encrypted,"tenant:actor:source")).toBe("private evidence");
  expect(()=>unseal(encrypted,"foreign:actor:source")).toThrow();
  vi.stubEnv("COTIZA_GMAIL_TOKEN_KEY","cd".repeat(32));expect(()=>unseal(encrypted,"tenant:actor:source")).toThrow();
});
it("binds confirmation to the precise tenant, actor, opportunity, client, mailbox and message",()=>{
  const token=signPreview(target,"reader@example.test",snapshot,1000);
  expect(verifyPreview(token,target,"reader@example.test","abc1",1001)).toBe(snapshotHash(snapshot));
  for(const patch of [{tenantId:"two"},{actorId:"other"},{clientId:"other"},{opportunityId:"other"}]) {
    expect(()=>verifyPreview(token,{...target,...patch},"reader@example.test","abc1",1001)).toThrow();
  }
  expect(()=>verifyPreview(token,target,"other@example.test","abc1",1001)).toThrow();
  expect(()=>verifyPreview(token,target,"reader@example.test","abc2",1001)).toThrow();
  expect(()=>verifyPreview(token,target,"reader@example.test","abc1",601000)).toThrow();
  expect(()=>verifyPreview(token+"x",target,"reader@example.test","abc1",1001)).toThrow();
});
it("ignores observation time but detects content changes and separate messages with the same subject",()=>{
  expect(snapshotHash({...snapshot,observedAt:"later"})).toBe(snapshotHash(snapshot));
  expect(snapshotHash({...snapshot,bodyText:"Changed"})).not.toBe(snapshotHash(snapshot));
  expect(snapshotHash({...snapshot,messageId:"abc2"})).not.toBe(snapshotHash(snapshot));
});
