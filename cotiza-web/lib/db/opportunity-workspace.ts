import "server-only";
import { prisma } from "./prisma";
import { getOpportunityPipelineByTenant } from "./opportunities";
import { labelOptionQuote } from "@/lib/domain/commercial-options";
import { getCommercialOptionSets } from "./commercial-options";
export type BusinessViewer = { userId: string; canSeeAll: boolean };
export async function resolveBusiness(tenantId: string, id: string, viewer: BusinessViewer) {
  const visible = (await getOpportunityPipelineByTenant(tenantId, viewer.userId, viewer.canSeeAll))
    .filter(o=>viewer.canSeeAll || o.ownerUserId===viewer.userId);
  const allowed=await prisma.opportunities.findMany({where:{tenant_id:tenantId,...(viewer.canSeeAll?{}:{owner_user_id:viewer.userId})},select:{opportunity_id:true,client_id:true}});
  const sources=await getCommercialOptionSets(tenantId,allowed.map(o=>o.opportunity_id));
  const alias=sources.find(s=>s.set.memberOpportunityIds.includes(id));
  const opportunity=visible.find(o=>o.opportunityId===(alias?.set.canonicalOpportunityId ?? id));
  if(!opportunity)return null;
  const source=sources.find(s=>s.set.canonicalOpportunityId===opportunity.opportunityId);
  const ids=source?source.set.memberOpportunityIds:[opportunity.opportunityId];
  if(!ids.every(member=>allowed.some(o=>o.opportunity_id===member && o.client_id===opportunity.clientId)))return null;
  return {opportunity,ids,optionLabels:source ? Object.fromEntries(source.quotes.map(q=>[q.quoteId,labelOptionQuote(source.set,q.quoteId,source.quotes)])) : {}};
}
export async function getBusinessWorkspace(tenantId: string, id: string, viewer: BusinessViewer) {
  const business=await resolveBusiness(tenantId,id,viewer);if(!business)return null;
  const {opportunity,ids}=business;
  const quotes=await prisma.quote.findMany({where:{tenantId,opportunity_id:{in:ids},...(viewer.canSeeAll?{}:{created_by_user_id:viewer.userId})},orderBy:[{createdAt:"desc"},{quote_id:"asc"}],select:{quote_id:true,quote_group_id:true,version:true,proposal_name:true,status:true,createdAt:true}});
  const proposals=await prisma.proposals.findMany({where:{tenant_id:tenantId,OR:[{opportunity_id:{in:ids}},{origin:{in:quotes.map(q=>q.quote_id)},opportunity_id:null}],...(viewer.canSeeAll?{}:{AND:[{OR:[{created_by_user_id:viewer.userId},{created_by_user_id:null}]}]})},orderBy:{created_at:"desc"},select:{proposal_id:true,status:true,outcome:true,formal_proposals:{where:{tenant_id:tenantId},orderBy:{created_at:"desc"},take:1,select:{proposal_number:true,quote_id:true,status:true,sent_at:true}}}});
  const tasks=await prisma.tasks.findMany({where:{tenant_id:tenantId,opportunity_id:{in:ids},completed_at:null,...(viewer.canSeeAll?{}:{created_by_user_id:viewer.userId})},orderBy:{due_date:"asc"},select:{task_id:true,description:true,due_date:true}});
  const owner=opportunity.ownerUserId ? await prisma.app_users.findFirst({where:{user_id:opportunity.ownerUserId,tenant_id:tenantId},select:{first_name:true,last_name:true}}):null;
  return {opportunity,quotes,proposals,tasks,optionLabels:business.optionLabels,ownerName:owner?`${owner.first_name} ${owner.last_name}`.trim():null};
}
export async function getDocumentBusinessContext(tenantId:string,kind:"quote"|"proposal",id:string,viewer:BusinessViewer) {
  let quoteId:string|undefined,proposalId:string|undefined,opportunityId:string|null=null;
  if(kind==="quote") {
    const q=await prisma.quote.findFirst({where:{tenantId,quote_id:id,...(viewer.canSeeAll?{}:{created_by_user_id:viewer.userId})},select:{opportunity_id:true}});if(!q)return null;quoteId=id;opportunityId=q.opportunity_id;
  } else {
    const p=await prisma.proposals.findFirst({where:{tenant_id:tenantId,proposal_id:id,...(viewer.canSeeAll?{}:{OR:[{created_by_user_id:viewer.userId},{created_by_user_id:null}]})},select:{opportunity_id:true,origin:true}});if(!p)return null;proposalId=id;opportunityId=p.opportunity_id;
    // A historical origin is only a quote link after checking its tenant and visibility.
    if(p.origin){const q=await prisma.quote.findFirst({where:{tenantId,quote_id:p.origin,...(viewer.canSeeAll?{}:{created_by_user_id:viewer.userId})},select:{quote_id:true,opportunity_id:true}});if(q && (!opportunityId || opportunityId===q.opportunity_id)){quoteId=q.quote_id;opportunityId??=q.opportunity_id;}}
  }
  if(!opportunityId)return null;
  const business=await resolveBusiness(tenantId,opportunityId,viewer);if(!business)return null;
  return {opportunityId:business.opportunity.opportunityId,opportunityNumber:business.opportunity.opportunityNumber,title:business.opportunity.title,quoteId,proposalId};
}
