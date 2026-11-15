/** Runs the actual store against disposable PostgreSQL WASM, with only Google simulated. */
import {readFile} from "node:fs/promises";
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),transaction:vi.fn(),email:vi.fn(),exchange:vi.fn(),read:vi.fn(),search:vi.fn()}));
vi.mock("@/lib/db/prisma",()=>({prisma:{$queryRaw:m.query,$executeRaw:m.execute,$transaction:m.transaction}}));
vi.mock("./client",()=>({accountEmail:m.email,exchangeToken:m.exchange,readMessage:m.read,searchMessages:m.search}));
import {gmailTestEnv} from "./test-env";
import {snapshotHash} from "./crypto";
import {beginAuthorization,consumeAuthorization,finishAuthorization,saveMessage,listLinks,disconnectAccount} from "./store";
import type {GmailSnapshot} from "./domain";
type Database={exec:(sql:string)=>Promise<unknown>;query:(sql:string,params?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>
  ;transaction:<T>(callback:(tx:Database)=>Promise<T>)=>Promise<T>;close:()=>Promise<void>};
const suite=process.env.PGLITE_MODULE?describe:describe.skip;
suite("Gmail persistence on disposable PostgreSQL",()=>{
  let db:Database;
  const actor={tenantId:"one",actorId:"actor"},target={...actor,clientId:"client",opportunityId:"opp"};
  const snapshot:GmailSnapshot={messageId:"abc1",threadId:"thread",internetMessageId:"<one@test>",subject:"Same subject",from:"from@test",to:"to@test",cc:"",date:"date",receivedAt:"2026-11-11T12:00:00Z",bodyText:"Private evidence",bodyFormat:"plain",attachments:[],observedAt:"2026-11-15T12:00:00Z"};
  const token={access_token:"synthetic-access",refresh_token:"synthetic-refresh",token_type:"Bearer",expires_in:3600};
  const tag=(database:Database)=>(strings:TemplateStringsArray,...values:unknown[])=>database.query(
    strings.reduce((sql,text,index)=>sql+(index?`$${index}`:"")+text,""),values.map(value=>value instanceof Date?value.toISOString():value));
  beforeAll(async()=>{
    const {PGlite}=await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);db=new PGlite() as Database;
    await db.exec(`CREATE TABLE tenants(tenant_id text PRIMARY KEY,active boolean DEFAULT true);
      CREATE TABLE app_users(user_id text PRIMARY KEY,role text NOT NULL,active boolean DEFAULT true);
      CREATE TABLE clients(client_id text PRIMARY KEY,tenant_id text NOT NULL);
      CREATE TABLE opportunities(opportunity_id text PRIMARY KEY,tenant_id text NOT NULL,client_id text NOT NULL);`);
    await db.exec(await readFile(new URL("../../../prisma/manual/20261115_gmail_context.sql",import.meta.url),"utf8"));
  });
  beforeEach(async()=>{
    gmailTestEnv();vi.clearAllMocks();m.email.mockResolvedValue("reader@example.test");m.read.mockResolvedValue({snapshot,original:{synthetic:true}});
    m.query.mockImplementation(async(strings,...values)=>(await tag(db)(strings,...values)).rows);
    m.execute.mockImplementation(async(strings,...values)=>{await tag(db)(strings,...values);return 1;});
    m.transaction.mockImplementation(callback=>db.transaction(async tx=>callback({
      $queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>(await tag(tx)(strings,...values)).rows,
      $executeRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{await tag(tx)(strings,...values);return 1;},
    })));
    await db.exec(`TRUNCATE gmail_link_events,gmail_opportunity_links,gmail_message_copies,gmail_oauth_attempts,gmail_connections,opportunities,clients,app_users,tenants CASCADE;
      INSERT INTO tenants(tenant_id) VALUES('one'),('two');INSERT INTO app_users(user_id,role) VALUES('actor','superadmin'),('other','superadmin');
      INSERT INTO clients VALUES('client','one'),('client-two','two');INSERT INTO opportunities VALUES('opp','one','client'),('opp-two','two','client-two');`);
  });
  afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>db?.close());
  async function connect(){await beginAuthorization(actor,"state","browser");await consumeAuthorization(actor,"state","browser");await finishAuthorization(actor,"state",token);}
  it("consumes OAuth proof once and rejects another browser/actor",async()=>{
    await beginAuthorization(actor,"state","browser");
    await expect(consumeAuthorization(actor,"state","foreign")).rejects.toMatchObject({status:422});
    await expect(consumeAuthorization({...actor,actorId:"other"},"state","browser")).rejects.toMatchObject({status:422});
    await consumeAuthorization(actor,"state","browser");
    await expect(consumeAuthorization(actor,"state","browser")).rejects.toMatchObject({status:422});
  });
  it("prevents a pending callback from restoring a disconnected account",async()=>{
    await beginAuthorization(actor,"state","browser");await consumeAuthorization(actor,"state","browser");await disconnectAccount(actor);
    await expect(finishAuthorization(actor,"state",token)).rejects.toMatchObject({status:409});
  });
  it("stores encrypted evidence once under duplicate confirmations",async()=>{
    await connect();await saveMessage(target,"abc1",snapshotHash(snapshot));
    expect(await saveMessage(target,"abc1",snapshotHash(snapshot))).toEqual({unchanged:true});
    const copies=await db.query("SELECT encrypted_archive FROM gmail_message_copies");
    expect(copies.rows).toHaveLength(1);expect(String(copies.rows[0].encrypted_archive)).not.toContain("Private evidence");
    expect((await db.query("SELECT * FROM gmail_link_events")).rows).toHaveLength(1);
    expect((await listLinks(target))[0].message.bodyText).toBe("Private evidence");
    expect(await listLinks({...target,actorId:"other"})).toEqual([]);expect(await listLinks({...target,tenantId:"two"})).toEqual([]);
  });
  it("keeps separate same-subject messages and rejects changed sources",async()=>{
    await connect();await saveMessage(target,"abc1",snapshotHash(snapshot));
    const second={...snapshot,messageId:"abc2",bodyText:"A different message"};m.read.mockResolvedValue({snapshot:second,original:{synthetic:true}});
    await saveMessage(target,"abc2",snapshotHash(second));expect(await listLinks(target)).toHaveLength(2);
    await expect(saveMessage(target,"abc2",snapshotHash(snapshot))).rejects.toMatchObject({status:409});
  });
  it("rechecks database role and opportunity after the provider read",async()=>{
    await connect();m.read.mockImplementation(async()=>{await db.exec("UPDATE app_users SET active=false WHERE user_id='actor'");return {snapshot,original:{}};});
    await expect(saveMessage(target,"abc1",snapshotHash(snapshot))).rejects.toMatchObject({status:403});
    expect((await db.query("SELECT * FROM gmail_message_copies")).rows).toHaveLength(0);
  });
  it("keeps saved copies after disconnect but prevents new reads/imports",async()=>{
    await connect();await saveMessage(target,"abc1",snapshotHash(snapshot));await disconnectAccount(actor);
    expect((await listLinks(target))[0].message.bodyText).toBe("Private evidence");
    await expect(saveMessage(target,"abc1",snapshotHash(snapshot))).rejects.toMatchObject({status:409});
  });
});
