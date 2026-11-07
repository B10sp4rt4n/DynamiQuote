import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
function visible(tenantId:string,userId:string) {
  return Prisma.sql`n.tenant_id=${tenantId} AND n.recipient_user_id=${userId}
    AND EXISTS(SELECT 1 FROM app_users u JOIN tenants t ON t.tenant_id=u.tenant_id
      JOIN proposals p ON p.proposal_id=n.proposal_id AND p.tenant_id=n.tenant_id
      JOIN opportunities o ON o.opportunity_id=n.opportunity_id AND o.tenant_id=n.tenant_id
      WHERE u.user_id=n.recipient_user_id AND u.tenant_id=n.tenant_id AND u.active=true AND t.active=true
        AND (u.role IN ('owner','admin','superadmin') OR (o.owner_user_id=u.user_id AND (p.created_by_user_id IS NULL OR p.created_by_user_id=u.user_id))))`;
}
export type WonInboxItem = { id:string; subject:string; body:string; href:string; reasons:string[]; createdAt:string; readAt:string|null };
export async function getWonInbox(tenantId:string,userId:string) {
  const scope=visible(tenantId,userId);
  const rows=await prisma.$queryRaw<Array<{notification_id:string;subject:string;body:string;link_path:string;reasons:string[];created_at:Date;read_at:Date|null;unread_count:bigint}>>`
    SELECT n.*,COUNT(*) FILTER(WHERE n.read_at IS NULL) OVER() AS unread_count FROM won_in_app_notifications n
    WHERE ${scope} ORDER BY n.created_at DESC,n.notification_id DESC LIMIT 50`;
  return { unreadCount:Number(rows[0]?.unread_count ?? 0),notifications:rows.map(row=>({
    id:row.notification_id,subject:row.subject,body:row.body,href:row.link_path,reasons:row.reasons,
    createdAt:row.created_at.toISOString(),readAt:row.read_at?.toISOString() ?? null,
  })) };
}
export async function markWonNoticeRead(tenantId:string,userId:string,id:string) {
  return (await prisma.$executeRaw`UPDATE won_in_app_notifications n SET read_at=COALESCE(n.read_at,now())
    WHERE n.notification_id=${id} AND ${visible(tenantId,userId)}`)>0;
}
