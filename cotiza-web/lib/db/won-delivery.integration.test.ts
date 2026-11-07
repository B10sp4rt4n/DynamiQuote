import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
vi.mock("server-only",()=>({}));
const url=process.env.COTIZA_WON_DELIVERY_TEST_URL;
const suite=url?describe:describe.skip;
suite("won delivery on disposable PostgreSQL",()=>{
  let db:typeof import("./prisma").prisma;
  let capture:typeof import("./won-notifications");
  let dispatcher:typeof import("./won-email-dispatch");
  let decisions:typeof import("./proposals");
  let inbox:typeof import("./won-inbox");
  const tenant=`won-${randomUUID()}`,foreign=`foreign-${randomUUID()}`,user=`user-${randomUUID()}`;
  const actor={userId:user,userRole:"owner" as const,isSuperAdmin:false};
  beforeAll(async()=>{
    if(new URL(url!).hostname!=="127.0.0.1")throw Error("Disposable loopback PostgreSQL only");
    process.env.DATABASE_URL=url;process.env.COTIZA_WON_EVENT_PILOT="true";
    process.env.COTIZA_WON_EMAIL_ENABLED="true";process.env.COTIZA_WON_IN_APP_ENABLED="true";
    process.env.APP_URL="https://cotiza.example";process.env.APP_ENV="development";
    db=(await import("./prisma")).prisma;capture=await import("./won-notifications");dispatcher=await import("./won-email-dispatch");decisions=await import("./proposals");inbox=await import("./won-inbox");
    // Execute the new migration in a real database, including its idempotent second application.
    const {Client}=await import("pg");const c=new Client({connectionString:url});await c.connect();
    const migration=readFileSync("prisma/manual/20261107_won_delivery.sql","utf8");await c.query(migration);await c.query(migration);await c.end();
    for(const t of [tenant,foreign])await db.tenant.create({data:{tenant_id:t,name:t,slug:t,created_at:new Date()}});
    await db.app_users.create({data:{user_id:user,tenant_id:tenant,first_name:"Prueba",last_name:"Responsable y admin",alias:user,email:"same@example.invalid",role:"owner",active:true,password_hash:"unused",created_at:new Date()}});
    await db.client.create({data:{client_id:tenant,tenant_id:tenant,company:"Cliente sintético",created_at:new Date()}});
    await capture.saveWonPolicy(tenant,user,{enabled:true,includeOwner:true,designatedUserIds:[user]});
  });
  afterAll(async()=>{await db?.$disconnect();});
  async function fixture(){
    const id=randomUUID();
    await db.opportunities.create({data:{opportunity_id:id,opportunity_number:`OPP-${id}`,tenant_id:tenant,client_id:tenant,title:"Prueba entrega",owner_user_id:user,created_at:new Date("2026-01-01")}});
    await db.quote.create({data:{quote_id:id,tenantId:tenant,client_id:tenant,opportunity_id:id,version:1}});
    await db.proposals.create({data:{proposal_id:id,tenant_id:tenant,opportunity_id:id,origin:id,status:"approved",created_by:"Prueba",created_by_user_id:user,created_at:new Date("2026-01-01")}});
    await db.formal_proposals.create({data:{proposal_doc_id:id,proposal_id:id,quote_id:id,proposal_number:`PROP-${id}`,issued_date:new Date("2026-01-01"),valid_until:new Date("2027-01-01"),issuer_company:"Piloto",recipient_company:"Cliente",currency:"MXN",tenant_id:tenant,created_at:new Date()}});
    await db.proposal_items.create({data:{item_id:id,proposal_id:id,tenant_id:tenant,item_number:1,quantity:1,cost_unit:65,price_unit:100,subtotal_cost:65,subtotal_price:100,status:"active",created_at:new Date()}});
    expect(await decisions.setProposalOutcomeByTenant(tenant,id,"won",actor,true,{closedOn:"2026-08-28"})).toBe("updated");
    return id;
  }
  async function row(id:string){return (await db.$queryRaw<Array<{delivery_id:string;source_event_id:string;state:string;attempt_count:number;message:{text:string}|null;idempotency_key:string}>>`SELECT * FROM won_email_deliveries WHERE proposal_id=${id}`)[0];}
  const transport=(send=vi.fn().mockResolvedValue({kind:"sent",id:"provider-id"}))=>({from:"Cotiza <notifications@example.invalid>",send});
  it("atomically creates one inbox notice and mailbox delivery for both roles; repeat saves do not duplicate",async()=>{
    const id=await fixture();await decisions.setProposalOutcomeByTenant(tenant,id,"won",actor,true,{closedOn:"2026-08-28"});
    const notices=await db.$queryRaw<Array<{reasons:string[]}>>`SELECT reasons FROM won_in_app_notifications WHERE proposal_id=${id}`;
    expect(notices).toHaveLength(1);expect(notices[0].reasons).toEqual(["opportunity_owner","tenant_designated"]);
    expect((await row(id)).state).toBe("pending");
    const t=transport();await dispatcher.processWonEmails(tenant,{transport:t});expect(t.send).toHaveBeenCalledTimes(1);expect((await row(id)).state).toBe("sent");
    await dispatcher.processWonEmails(tenant,{transport:t});expect(t.send).toHaveBeenCalledTimes(1);
  });
  it("keeps a frozen envelope and idempotency key when retrying an unknown provider result",async()=>{
    const id=await fixture(),send=vi.fn().mockResolvedValueOnce({kind:"retry",code:"provider_result_unknown"}).mockResolvedValueOnce({kind:"sent",id:"reconciled"});
    const t=transport(send),now=new Date();await dispatcher.processWonEmails(tenant,{transport:t,now});expect((await row(id)).state).toBe("pending");
    const frozen=(await row(id)).message;process.env.APP_URL="https://changed.example";
    await dispatcher.processWonEmails(tenant,{transport:t,now:new Date(now.getTime()+120000)});process.env.APP_URL="https://cotiza.example";
    expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);expect((await row(id)).message).toEqual(frozen);expect((await row(id)).state).toBe("sent");
  });
  it("claims once when two workers race",async()=>{
    const id=await fixture(),send=vi.fn().mockImplementation(async()=>{await new Promise(r=>setTimeout(r,40));return {kind:"sent",id:"race"};});const t=transport(send);
    await Promise.all([dispatcher.processWonEmails(tenant,{transport:t}),dispatcher.processWonEmails(tenant,{transport:t})]);
    expect(send).toHaveBeenCalledTimes(1);expect((await row(id)).attempt_count).toBe(1);
  });
  it("revalidates active status and suppresses mail after access is revoked",async()=>{
    const id=await fixture();await db.app_users.update({where:{user_id:user},data:{active:false}});const t=transport();
    await dispatcher.processWonEmails(tenant,{transport:t});expect(t.send).not.toHaveBeenCalled();expect((await row(id)).state).toBe("suppressed");
    expect((await inbox.getWonInbox(tenant,user)).notifications).toHaveLength(0);await db.app_users.update({where:{user_id:user},data:{active:true}});
  });
  it("lists only the recipient's tenant and marks one notice read idempotently",async()=>{
    const notices=await inbox.getWonInbox(tenant,user);expect(notices.unreadCount).toBeGreaterThan(0);const notice=notices.notifications[0];
    expect((await inbox.getWonInbox(foreign,user)).notifications).toEqual([]);expect(await inbox.markWonNoticeRead(foreign,user,notice.id)).toBe(false);expect(await inbox.markWonNoticeRead(tenant,"another-user",notice.id)).toBe(false);
    expect(await inbox.markWonNoticeRead(tenant,user,notice.id)).toBe(true);expect(await inbox.markWonNoticeRead(tenant,user,notice.id)).toBe(true);
    expect((await inbox.getWonInbox(tenant,user)).notifications.find(n=>n.id===notice.id)?.readAt).not.toBeNull();
  });
  it("never resends after the provider idempotency window",async()=>{
    const id=await fixture();await db.$executeRaw`UPDATE won_email_deliveries SET first_attempt_at=now()-interval '24 hours',attempt_count=1 WHERE proposal_id=${id}`;const t=transport();
    await dispatcher.processWonEmails(tenant,{transport:t});expect(t.send).not.toHaveBeenCalled();expect((await row(id)).state).toBe("uncertain");
  });
  it("recovers an expired lease with the same frozen payload/key and records the orphaned attempt",async()=>{
    const id=await fixture(),first=row(id);const r=await first;const frozen={from:"Cotiza <notifications@example.invalid>",to:"same@example.invalid",subject:"Original",text:"Original body"};
    await db.$executeRaw`UPDATE won_email_deliveries SET state='sending',attempt_count=1,first_attempt_at=now()-interval '5 minutes',lease_until=now()-interval '1 minute',lease_token='orphan',message=${JSON.stringify(frozen)}::jsonb WHERE delivery_id=${r.delivery_id}`;
    await db.$executeRaw`INSERT INTO won_email_attempts(attempt_id,delivery_id,attempt_number,started_at,state) VALUES (${randomUUID()},${r.delivery_id},1,now()-interval '5 minutes','sending')`;
    const t=transport();await dispatcher.processWonEmails(tenant,{transport:t});expect(t.send).toHaveBeenCalledWith(frozen,r.idempotency_key);
    expect((await row(id)).state).toBe("sent");const attempts=await db.$queryRaw<Array<{state:string}>>`SELECT state FROM won_email_attempts WHERE delivery_id=${r.delivery_id} ORDER BY attempt_number`;expect(attempts.map(a=>a.state)).toEqual(["uncertain","sent"]);
  });
  it("does not turn an administrative designation into document access",async()=>{
    const outsider=`outsider-${randomUUID()}`;
    await db.app_users.create({data:{user_id:outsider,tenant_id:tenant,first_name:"Otro",last_name:"Vendedor",alias:outsider,email:"outsider@example.invalid",role:"user",password_hash:"unused",created_at:new Date()}});
    await capture.saveWonPolicy(tenant,user,{enabled:true,includeOwner:true,designatedUserIds:[user,outsider]});
    const id=await fixture();const notices=await db.$queryRaw<Array<{recipient_user_id:string}>>`SELECT recipient_user_id FROM won_in_app_notifications WHERE proposal_id=${id}`;
    expect(notices.map(n=>n.recipient_user_id)).toEqual([user]);const t=transport();await dispatcher.processWonEmails(tenant,{transport:t});expect(t.send).toHaveBeenCalledTimes(1);
    await capture.saveWonPolicy(tenant,user,{enabled:true,includeOwner:true,designatedUserIds:[user]});
  });
  it("suppresses unsent mail when the tenant is deactivated",async()=>{
    const id=await fixture();await db.tenant.update({where:{tenant_id:tenant},data:{active:false}});const t=transport();await dispatcher.processWonEmails(tenant,{transport:t});expect(t.send).not.toHaveBeenCalled();expect((await row(id)).state).toBe("suppressed");await db.tenant.update({where:{tenant_id:tenant},data:{active:true}});
  });
  it("keeps pending mail paused without touching transport when the global flag is off",async()=>{
    const id=await fixture();process.env.COTIZA_WON_EMAIL_ENABLED="false";const t=transport();
    expect(await dispatcher.processWonEmails(tenant,{transport:t})).toEqual({mode:"paused",processed:0});expect(t.send).not.toHaveBeenCalled();expect((await row(id)).state).toBe("pending");process.env.COTIZA_WON_EMAIL_ENABLED="true";
  });
});
