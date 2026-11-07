import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const suite=process.env.COTIZA_WORKSPACE_NATIVE==="1"?describe:describe.skip;
suite("business workspace on disposable native PostgreSQL",()=>{
 let db:typeof import("./prisma").prisma;let api:typeof import("./opportunity-workspace");let declare:typeof import("./declare-opportunity").declareOpportunity;let quote:typeof import("./quotes").createQuoteForTenant;
 const tenant=`workspace-${randomUUID()}`,other=`foreign-${randomUUID()}`,clientId=randomUUID(),viewer={userId:"workspace-seller",canSeeAll:false};
 let id:string,qid:string;
 beforeAll(async()=>{if(new URL(process.env.DATABASE_URL!).hostname!=="127.0.0.1")throw Error("Local DB only");({prisma:db}=await import("./prisma"));api=await import("./opportunity-workspace");({declareOpportunity:declare}=await import("./declare-opportunity"));({createQuoteForTenant:quote}=await import("./quotes"));for(const t of [tenant,other])await db.tenant.create({data:{tenant_id:t,name:t,slug:t,created_at:new Date()}});await db.client.create({data:{client_id:clientId,tenant_id:tenant,company:"Synthetic dossier",created_at:new Date()}});
 const o=await declare(tenant,viewer.userId,{creationId:randomUUID(),clientId,title:"Central business"});id=o.opportunityId;const q=await quote(tenant,{clientId,clientName:"Synthetic dossier",creationId:randomUUID(),opportunityMode:"existing",opportunityId:id},viewer.userId);qid=q.quoteId;
 await db.proposals.create({data:{proposal_id:randomUUID(),tenant_id:tenant,origin:qid,opportunity_id:id,status:"draft",created_by:viewer.userId,created_by_user_id:viewer.userId,created_at:new Date()}});
 await db.proposals.create({data:{proposal_id:randomUUID(),tenant_id:tenant,origin:qid,opportunity_id:id,status:"draft",created_by:"other-seller",created_by_user_id:"other-seller",created_at:new Date()}});
 });
 afterAll(async()=>db?.$disconnect());
 it("shows only the authorized documents and preserves exact context",async()=>{const w=await api.getBusinessWorkspace(tenant,id,viewer);expect(w?.quotes.map(q=>q.quote_id)).toEqual([qid]);expect(w?.proposals).toHaveLength(1);expect(await api.getDocumentBusinessContext(tenant,"quote",qid,viewer)).toMatchObject({opportunityId:id,quoteId:qid});expect(await api.getDocumentBusinessContext(tenant,"proposal",w!.proposals[0].proposal_id,viewer)).toMatchObject({opportunityId:id,quoteId:qid,proposalId:w!.proposals[0].proposal_id});});
 it("rejects another tenant and seller on both ficha and document lookup",async()=>{for(const args of [{tenant:other,viewer},{tenant,viewer:{...viewer,userId:"intruder"}}]){expect(await api.getBusinessWorkspace(args.tenant,id,args.viewer)).toBeNull();expect(await api.getDocumentBusinessContext(args.tenant,"quote",qid,args.viewer)).toBeNull();}});
 it("resolves an alternative to the canonical business without adding another seller's members",async()=>{
 const a=await quote(tenant,{clientId,clientName:"Synthetic dossier",creationId:randomUUID(),opportunityMode:"new",proposalName:"Alternative A"},viewer.userId);const b=await quote(tenant,{clientId,clientName:"Synthetic dossier",creationId:randomUUID(),opportunityMode:"new",proposalName:"Alternative B"},viewer.userId);
 const qa=await db.quote.findUniqueOrThrow({where:{quote_id:a.quoteId}}),qb=await db.quote.findUniqueOrThrow({where:{quote_id:b.quoteId}});
 const set={version:1,id:randomUUID(),canonicalOpportunityId:qa.opportunity_id!,memberOpportunityIds:[qa.opportunity_id!,qb.opportunity_id!],placeholderQuoteIds:[],selectedOptionId:null,options:[{id:"a",ordinal:1,label:"A",quoteIds:[a.quoteId]},{id:"b",ordinal:2,label:"B",quoteIds:[b.quoteId]}],configuredBy:viewer.userId,configuredAt:new Date().toISOString()};
 await db.quote.update({where:{quote_id:a.quoteId},data:{input_metadata:{commercialOptionsSet:set}}});
 const w=await api.getBusinessWorkspace(tenant,qb.opportunity_id!,viewer);expect(w?.opportunity.opportunityId).toBe(qa.opportunity_id);expect(w?.quotes).toHaveLength(2);expect(await api.getDocumentBusinessContext(tenant,"quote",b.quoteId,viewer)).toMatchObject({opportunityId:qa.opportunity_id,quoteId:b.quoteId});
 await db.opportunities.update({where:{opportunity_id:qb.opportunity_id!},data:{owner_user_id:"other-seller"}});expect(await api.getBusinessWorkspace(tenant,qb.opportunity_id!,viewer)).toBeNull();
 });
});
