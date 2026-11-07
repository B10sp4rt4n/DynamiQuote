import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getDocumentBusinessContext } from "@/lib/db/opportunity-workspace";
export async function GET(request:Request) {
 const tenant=await getCurrentTenantContext();if(!tenant?.userId)return NextResponse.json({error:"No autorizado"},{status:401});
 const query=new URL(request.url).searchParams;const quote=query.getAll("quoteId"),proposal=query.getAll("proposalId");
 if(quote.length+proposal.length!==1 || !(quote[0]||proposal[0]))return NextResponse.json({error:"Selecciona un documento"},{status:422});
 const context=await getDocumentBusinessContext(tenant.id,quote.length?"quote":"proposal",quote[0]||proposal[0],{userId:tenant.userId,canSeeAll:tenant.isSuperAdmin || ["owner","admin"].includes(tenant.userRole)});
 return NextResponse.json(context?{context}:{error:"Negocio no disponible"},{status:context?200:404,headers:{"Cache-Control":"private, no-store"}});
}
