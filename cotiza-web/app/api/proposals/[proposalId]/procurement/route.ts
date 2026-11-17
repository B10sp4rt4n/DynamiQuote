import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { actOnProcurement, getProcurementView, WinError } from "@/lib/db/won-consolidation";
import { procurementActionSchema } from "@/lib/domain/procurement-draft";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
type Context = { params: Promise<{ proposalId: string }> };
function failure(error: unknown) {
  return NextResponse.json({ error:error instanceof WinError?error.message:"No se pudo confirmar la requisición. Recupera su estado antes de continuar." },
    {status:error instanceof WinError?error.status:500,headers:{"Cache-Control":"no-store"}});
}
export async function GET(request:Request,context:Context) {
  const tenant=await getCurrentTenantContext();
  if(!tenant?.userId||tenant.authMode!=="clerk") return NextResponse.json({error:"Inicia sesión"},{status:401});
  try {
    const view=await getProcurementView(tenant.id,(await context.params).proposalId,{...tenant,userId:tenant.userId});
    const id=new URL(request.url).searchParams.get("downloadDraft");
    if(id) {
      const draft=view.drafts.find(d=>d.id===id);
      if(!draft) return NextResponse.json({error:"Requisición no encontrada"},{status:404});
      return new Response(JSON.stringify({schemaVersion:1,documentKind:"purchase_requisition_draft",executionAllowed:false,draft},null,2),{
        headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
          "Content-Disposition":`attachment; filename="${draft.folio.replace(/[^a-zA-Z0-9_-]/g,"_")}.json"`},
      });
    }
    return NextResponse.json(view,{headers:{"Cache-Control":"no-store"}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request,context:Context) {
  const tenant=await getCurrentTenantContext();
  if(!tenant?.userId||tenant.authMode!=="clerk") return NextResponse.json({error:"Inicia sesión"},{status:401});
  if(request.headers.get("origin")!==new URL(request.url).origin) return NextResponse.json({error:"Origen no autorizado"},{status:403});
  if(request.headers.get("X-Tenant-Context")!==tenant.id) return NextResponse.json({error:"La empresa activa cambió. Recupera el estado."},{status:409});
  if(Number(request.headers.get("content-length")??0)>16384) return NextResponse.json({error:"La solicitud es demasiado extensa"},{status:413});
  if(!enforceRateLimit(`procurement:${tenant.id}:${tenant.userId}`,30,60000).allowed) return NextResponse.json({error:"Espera un momento antes de continuar"},{status:429});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>16384) return NextResponse.json({error:"La solicitud es demasiado extensa"},{status:413});
  let value:unknown;try{value=JSON.parse(raw);}catch{value=null;}
  const parsed=procurementActionSchema.safeParse(value);
  if(!parsed.success) return NextResponse.json({error:parsed.error.issues[0]?.message??"Revisa los datos"},{status:422});
  try {return NextResponse.json(await actOnProcurement(tenant.id,(await context.params).proposalId,{...tenant,userId:tenant.userId},parsed.data),
    {headers:{"Cache-Control":"no-store"}});}catch(error){return failure(error);}
}
