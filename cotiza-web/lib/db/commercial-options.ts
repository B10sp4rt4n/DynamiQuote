import "server-only";
import { randomUUID, createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { optionSetSchema, labelOptionQuote, summarizeOptions, type CommercialOptionSet, type OptionQuote, type CommercialOptionsSummary } from "@/lib/domain/commercial-options";

type Source = { rootId: string; metadata: Prisma.JsonValue; set: CommercialOptionSet; quotes: OptionQuote[] };
export async function getCommercialOptionSets(tenantId: string, opportunityIds: string[]): Promise<Source[]> {
  if (!opportunityIds.length) return [];
  const roots = await prisma.quote.findMany({ where: { tenantId, opportunity_id: { in: opportunityIds }, input_metadata: { path: ["commercialOptionsSet"], not: Prisma.AnyNull } }, select: { quote_id: true, input_metadata: true } });
  const result: Source[] = [];
  for (const root of roots) {
    const metadata = root.input_metadata;
    const parsed = optionSetSchema.safeParse((metadata as Record<string,unknown> | null)?.commercialOptionsSet);
    if (!parsed.success) throw new Error("Configuración de opciones inválida; requiere revisión");
    const set = parsed.data;
    // Never use membership to widen the authorized opportunity set.
    if (!set.memberOpportunityIds.every(id => opportunityIds.includes(id))) continue;
    const records = await prisma.quote.findMany({ where: { tenantId, opportunity_id: { in: set.memberOpportunityIds } }, select: { quote_id: true, parent_quote_id: true, opportunity_id: true, client_id: true, total_revenue: true, createdAt: true } });
    const quotes = records.map(q => ({ quoteId:q.quote_id,parentQuoteId:q.parent_quote_id,opportunityId:q.opportunity_id,clientId:q.client_id,revenue:Number(q.total_revenue ?? 0),createdAt:q.createdAt?.toISOString() ?? "" }));
    const bases = set.options.flatMap(o => o.quoteIds.map(id => quotes.find(q => q.quoteId === id)));
    if (bases.some(q => !q) || new Set(bases.map(q => q!.clientId)).size !== 1 || !bases[0]?.clientId) throw new Error("Opciones incompletas o de distinta cuenta; requiere revisión");
    result.push({ rootId:root.quote_id,metadata:metadata!,set,quotes });
  }
  return result;
}
export async function getCommercialOpportunityOverrides(tenantId: string, opportunityIds: string[]) {
  const sources = await getCommercialOptionSets(tenantId,opportunityIds);
  const aliases = new Set<string>();
  const overrides = new Map<string,{ summary: CommercialOptionsSummary; memberOpportunityIds: string[]; amount: number; stage: "open"|"won"|"lost"; closedAt:string|null }>();
  for (const source of sources) {
    const { set, quotes } = source;
    const summary = summarizeOptions(set,quotes);
    const proposals = await prisma.proposals.findMany({ where:{tenant_id:tenantId,opportunity_id:{in:set.memberOpportunityIds}},select:{proposal_id:true,origin:true,outcome:true,outcome_at:true,created_at:true} });
    const winners = proposals.filter(p => p.outcome === "won" && p.origin && labelOptionQuote(set,p.origin,quotes));
    const winnerIds = new Set(winners.map(p => labelOptionQuote(set,p.origin!,quotes)!.optionId));
    let amount = summary.options.find(o => o.id === summary.selectedOptionId)?.amount ?? 0;
    let stage: "open"|"won"|"lost" = "open", closedAt:string|null = null;
    if (winnerIds.size > 1) { summary.reviewRequired=true; stage="won"; amount=0; }
    else if (winners.length) {
      const winner = winners.sort((a,b)=>b.created_at.getTime()-a.created_at.getTime())[0];
      const items = await prisma.proposal_items.aggregate({where:{tenant_id:tenantId,proposal_id:winner.proposal_id,status:{not:"deleted"}},_sum:{subtotal_price:true}});
      amount = Number(items._sum.subtotal_price ?? 0); stage="won"; closedAt=winner.outcome_at?.toISOString() ?? null;
    } else if (set.options.every(option => proposals.some(p => p.outcome === "lost" && p.origin && labelOptionQuote(set,p.origin,quotes)?.optionId === option.id)) && !proposals.some(p => p.outcome === null)) {
      stage="lost";
    }
    for (const id of set.memberOpportunityIds) if(id!==set.canonicalOpportunityId) aliases.add(id);
    overrides.set(set.canonicalOpportunityId,{summary,memberOpportunityIds:set.memberOpportunityIds,amount,stage,closedAt});
  }
  return {aliases,overrides};
}
export async function selectCommercialOption(tenantId:string,opportunityId:string,optionId:string|null,actor:{userId:string;isSuperAdmin:boolean;userRole:string}) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial-options:${tenantId}:${opportunityId}`},0))`;
    const opportunity=await tx.opportunities.findFirst({where:{tenant_id:tenantId,opportunity_id:opportunityId}});
    if(!opportunity || (!actor.isSuperAdmin && !["owner","admin"].includes(actor.userRole) && opportunity.owner_user_id!==actor.userId)) return false;
    const roots=await tx.quote.findMany({where:{tenantId,opportunity_id:opportunityId,input_metadata:{path:["commercialOptionsSet"],not:Prisma.AnyNull}},select:{quote_id:true,input_metadata:true}});
    const root=roots[0]; if(!root || roots.length!==1) return false;
    const set=optionSetSchema.parse((root.input_metadata as Record<string,unknown>).commercialOptionsSet);
    if(set.canonicalOpportunityId!==opportunityId || (optionId!==null && !set.options.some(o=>o.id===optionId))) return false;
    if(set.selectedOptionId===optionId) return true;
    const next={...set,selectedOptionId:optionId};
    const changed=await tx.quote.updateMany({where:{tenantId,quote_id:root.quote_id,input_metadata:{equals:root.input_metadata!}},data:{input_metadata:{...(root.input_metadata as Prisma.JsonObject),commercialOptionsSet:next} as Prisma.InputJsonObject}});
    if(changed.count!==1) throw new Error("Las opciones cambiaron; recarga e intenta nuevamente");
    const linked=await tx.proposals.findMany({where:{tenant_id:tenantId,opportunity_id:{in:set.memberOpportunityIds}},select:{proposal_id:true}});
    const payload=JSON.stringify({version:1,setId:set.id,previousOptionId:set.selectedOptionId,selectedOptionId:optionId,actorUserId:actor.userId,scope:"commercial_preference_only"});
    await tx.proposal_audit_events.createMany({data:linked.map(p=>({event_id:randomUUID(),tenant_id:tenantId,proposal_id:p.proposal_id,event_type:"commercial_option_selected",event_hash:createHash("sha256").update(payload).digest("hex"),payload,created_at:new Date()}))});
    return true;
  });
}
