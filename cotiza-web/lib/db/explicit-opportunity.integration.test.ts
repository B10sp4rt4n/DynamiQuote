import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const suite = process.env.COTIZA_EXPLICIT_NATIVE === "1" ? describe : describe.skip;
suite("explicit declaration on disposable native PostgreSQL",()=>{
 let db: typeof import("./prisma").prisma;
 let declare: typeof import("./declare-opportunity").declareOpportunity;
 let createQuote: typeof import("./quotes").createQuoteForTenant;
 const tenant = `native-${randomUUID()}`, clientId=randomUUID(), actor="seller-native";
 beforeAll(async()=>{
  if(new URL(process.env.DATABASE_URL!).hostname!=="127.0.0.1")throw Error("Disposable local PostgreSQL required");
  ({prisma:db}=await import("./prisma"));({declareOpportunity:declare}=await import("./declare-opportunity"));({createQuoteForTenant:createQuote}=await import("./quotes"));
  await db.tenant.create({data:{tenant_id:tenant,name:tenant,slug:tenant,created_at:new Date()}});
  await db.client.create({data:{tenant_id:tenant,client_id:clientId,company:"Synthetic native",active:true,created_at:new Date()}});
 });
 afterAll(async()=>{await db?.$disconnect();});
 it("concurrent retry creates one opportunity and reuses its identity for a quote",async()=>{
  const input={creationId:randomUUID(),clientId,title:"Concurrent native renewal"};
  const rows=await Promise.all(Array.from({length:6},()=>declare(tenant,actor,input)));
  expect(new Set(rows.map(x=>x.opportunityId)).size).toBe(1);
  expect(await db.opportunities.count({where:{tenant_id:tenant}})).toBe(1);
  const quote=await createQuote(tenant,{clientName:"Synthetic native",clientId,creationId:randomUUID(),opportunityMode:"existing",opportunityId:rows[0].opportunityId},actor);
  expect((await db.quote.findUniqueOrThrow({where:{quote_id:quote.quoteId}})).opportunity_id).toBe(rows[0].opportunityId);
  expect(await db.opportunities.count({where:{tenant_id:tenant}})).toBe(1);
 });
 it("simultaneous quote-origin and standalone creates use distinct consecutive folios",async()=>{
  await Promise.all(Array.from({length:8},(_,i)=>i%2 ? declare(tenant,actor,{creationId:randomUUID(),clientId,title:`Standalone ${i}`}) : createQuote(tenant,{clientName:"Synthetic native",clientId,creationId:randomUUID(),opportunityMode:"new"},actor)));
  const rows=await db.opportunities.findMany({where:{tenant_id:tenant}});
  expect(rows).toHaveLength(9);expect(new Set(rows.map(x=>x.opportunity_number)).size).toBe(9);
  expect(rows.map(x=>Number(x.opportunity_number.replace("OPP-",""))).sort((a,b)=>a-b)).toEqual([1,2,3,4,5,6,7,8,9]);
 });
 it("rejects foreign clients and a changed-actor replay",async()=>{
  await expect(declare("other-tenant",actor,{creationId:randomUUID(),clientId,title:"Denied"})).rejects.toMatchObject({status:404});
  const input={creationId:randomUUID(),clientId,title:"Owned"};await declare(tenant,actor,input);
  await expect(declare(tenant,"other-seller",input)).rejects.toMatchObject({status:409});
 });
});
