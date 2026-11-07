import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getWonInbox,markWonNoticeRead } from "@/lib/db/won-inbox";
import { deliveryFlags } from "@/lib/notifications/won-message";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
const headers={"Cache-Control":"private, no-store"};
export async function GET() {
  const tenant=await getCurrentTenantContext();if(!tenant?.userId)return NextResponse.json({error:"No autorizado"},{status:401});
  if(!deliveryFlags().inApp)return NextResponse.json({notifications:[],unreadCount:0,mode:"paused"},{headers});
  return NextResponse.json(await getWonInbox(tenant.id,tenant.userId),{headers});
}
export async function PATCH(request:Request) {
  const tenant=await getCurrentTenantContext();if(!tenant?.userId)return NextResponse.json({error:"No autorizado"},{status:401});
  if(!deliveryFlags().inApp)return NextResponse.json({error:"Avisos todavía no habilitados"},{status:404});
  if(!enforceRateLimit(`won-read:${tenant.id}:${tenant.userId}`,60,60000).allowed)return NextResponse.json({error:"Intenta en un momento"},{status:429});
  const parsed=z.object({notificationId:z.string().min(1).max(100)}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Aviso inválido"},{status:422});
  if(!await markWonNoticeRead(tenant.id,tenant.userId,parsed.data.notificationId))return NextResponse.json({error:"Aviso no encontrado"},{status:404});
  return NextResponse.json({ok:true},{headers});
}
