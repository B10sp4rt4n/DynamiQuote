import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { selectCommercialOption } from "@/lib/db/commercial-options";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
const schema=z.object({optionId:z.string().min(1).nullable()}).strict();
export async function PATCH(request:Request,{params}:{params:Promise<{opportunityId:string}>}) {
  const tenant=await getCurrentTenantContext();
  if(!tenant?.userId) return NextResponse.json({error:"No autorizado"},{status:401});
  const rate=enforceRateLimit(`commercial-option:${tenant.id}:${getRequestIdentity(request,tenant.userId)}`,30,60000);
  if(!rate.allowed) return NextResponse.json({error:"Intenta en un momento"},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Opción inválida"},{status:422});
  try {
    const {opportunityId}=await params;
    const ok=await selectCommercialOption(tenant.id,opportunityId,parsed.data.optionId,{userId:tenant.userId,isSuperAdmin:tenant.isSuperAdmin,userRole:tenant.userRole});
    return NextResponse.json(ok?{ok:true}:{error:"Oportunidad u opción no disponible"},{status:ok?200:404});
  } catch {return NextResponse.json({error:"No se pudo actualizar la opción. Recarga e intenta nuevamente."},{status:409});}
}
