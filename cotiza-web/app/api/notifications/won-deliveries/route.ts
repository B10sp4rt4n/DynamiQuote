import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { processWonEmails } from "@/lib/db/won-email-dispatch";
import { deliveryFlags } from "@/lib/notifications/won-message";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
export const maxDuration=60;
async function context(){
  const tenant=await getCurrentTenantContext();if(!tenant?.userId)return NextResponse.json({error:"No autorizado"},{status:401});
  if(!tenant.isSuperAdmin && !["owner","admin"].includes(tenant.userRole))return NextResponse.json({error:"Solo administración"},{status:403});
  if(!deliveryFlags().email)return NextResponse.json({mode:"paused",deliveries:[]},{headers:{"Cache-Control":"private, no-store"}});
  return tenant;
}
export async function GET(){
  const tenant=await context();if(tenant instanceof NextResponse)return tenant;
  const deliveries=await prisma.$queryRaw`SELECT delivery_id,source_event_id,normalized_email,state,attempt_count,provider_message_id,last_error_code,next_attempt_at,sent_at
    FROM won_email_deliveries WHERE tenant_id=${tenant.id} ORDER BY created_at DESC,delivery_id DESC LIMIT 30`;
  return NextResponse.json({deliveries},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(){
  const tenant=await context();if(tenant instanceof NextResponse)return tenant;
  if(!enforceRateLimit(`won-worker:${tenant.id}:${tenant.userId}`,4,60000).allowed)return NextResponse.json({error:"Intenta en un momento"},{status:429});
  return NextResponse.json(await processWonEmails(tenant.id));
}
