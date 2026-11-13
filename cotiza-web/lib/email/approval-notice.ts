import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getApprovalNotices, getWinPolicy, type ApprovalNotice } from "@/lib/db/won-consolidation";
import type { WinActor } from "@/lib/domain/won-consolidation";
import { resolveResendConfig } from "./resend";
import { getPublicAppUrl } from "@/lib/utils/app-url";

export const APPROVAL_EMAIL_VERSION = "approval-notice-v1";
export function approvalMessage(input: { name: string; tenantName: string; notice: ApprovalNotice; appUrl: string }) {
  const { name, tenantName, notice, appUrl } = input;
  const url = new URL(notice.href, appUrl).toString();
  return { subject: `Cotiza: aprobación pendiente · ${notice.proposalNumber}`,
    body: `Hola, ${name}.\n\nTienes una solicitud de aprobación pendiente en ${tenantName}.\n\nPropuesta: ${notice.proposalNumber}\nCliente: ${notice.recipientCompany}\nRevisión requerida: ${notice.requirements.join("; ")}\n\nRevisa y registra tu decisión en Cotiza:\n${url}\n\nLa solicitud permanecerá pendiente hasta que sea atendida o retirada. Este correo no registra una aprobación.\n\nCotiza · Avisos de aprobación` };
}
type Receipt = { notification_key: string; recipient_id: string; recipient_email: string; request_key: string; kind: string; subject: string; body: string; state: string; provider_id: string | null };
function liveDeliveryAllowed() {
  return process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production" && process.env.APP_ENV === "production");
}
export async function sendApprovalNotices(tenantId: string, proposalId: string): Promise<{ sent: number; issues: number }> {
  if (!liveDeliveryAllowed()) return { sent: 0, issues: 0 };
  const policy = await getWinPolicy(tenantId);
  if (!policy.approvalEmailEnabled) return { sent: 0, issues: 0 };
  const appUrl = getPublicAppUrl();
  if (!appUrl.ok) return { sent: 0, issues: 1 };
  const tenant = await prisma.tenant.findUnique({ where: { tenant_id: tenantId }, select: { name: true } });
  if (!tenant) return { sent: 0, issues: 1 };
  const users = await prisma.app_users.findMany({ where: { tenant_id: tenantId, active: true, user_id: { startsWith: "user_" }, email: { not: null } },
    select: { user_id: true, role: true, email: true, first_name: true, last_name: true } });
  const config = await resolveResendConfig();
  let sent = 0, issues = 0;
  const seen = new Set<string>();
  for (const user of users) {
    if (!["owner", "admin", "user"].includes(user.role) || !user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) continue;
    const actor: WinActor = { userId: user.user_id, userRole: user.role as WinActor["userRole"], isSuperAdmin: false };
    const notices = (await getApprovalNotices(tenantId, actor)).filter(n => n.proposalId === proposalId);
    for (const notice of notices) {
      const email = user.email.trim().toLowerCase();
      const key = createHash("sha256").update(JSON.stringify([APPROVAL_EMAIL_VERSION, tenantId, proposalId, email, notice.kind, notice.requestKey])).digest("hex");
      if (seen.has(key)) continue;
      seen.add(key);
      const message = approvalMessage({ name: `${user.first_name} ${user.last_name}`.trim(), tenantName: tenant.name, notice, appUrl: appUrl.url });
      await prisma.$executeRaw`INSERT INTO approval_email_outbox(notification_key,tenant_id,proposal_id,recipient_id,recipient_email,request_key,kind,subject,body)
        VALUES(${key},${tenantId},${proposalId},${user.user_id},${email},${notice.requestKey},${notice.kind},${message.subject},${message.body}) ON CONFLICT(notification_key) DO NOTHING`;
      if (!config.client) { issues++; continue; }
      // Re-read the pending request immediately before claiming it. This never changes its decision.
      if (!(await getWinPolicy(tenantId)).approvalEmailEnabled || !(await getApprovalNotices(tenantId, actor)).some(n => n.proposalId === proposalId && n.requestKey === notice.requestKey)) {
        await prisma.$executeRaw`UPDATE approval_email_outbox SET state='cancelled' WHERE notification_key=${key} AND state='pending'`; continue;
      }
      const claimed = await prisma.$queryRaw<Receipt[]>`UPDATE approval_email_outbox SET state='sending',attempts=attempts+1,attempted_at=now()
        WHERE notification_key=${key} AND state='pending' RETURNING *`;
      const receipt = claimed[0];
      if (!receipt) continue;
      try {
        const result = await config.client.emails.send({ from: config.from, to: [receipt.recipient_email], subject: receipt.subject, text: receipt.body }, { idempotencyKey: key });
        if (result.error) {
          const state = result.error.statusCode && result.error.statusCode < 500 ? "failed" : "unknown";
          await prisma.$executeRaw`UPDATE approval_email_outbox SET state=${state},last_error=${result.error.message.slice(0, 500)} WHERE notification_key=${key} AND state='sending'`;
          issues++; continue;
        }
        if (!result.data?.id) throw new Error("El proveedor no devolvió identificador de envío");
        await prisma.$executeRaw`UPDATE approval_email_outbox SET state='sent',provider_id=${result.data.id},sent_at=now(),last_error=NULL WHERE notification_key=${key} AND state='sending'`;
        sent++;
      } catch {
        // A lost response can mean accepted delivery. Never send a second message blindly.
        await prisma.$executeRaw`UPDATE approval_email_outbox SET state='unknown',last_error='Respuesta de envío sin confirmar; verificar el proveedor antes de reintentar' WHERE notification_key=${key} AND state='sending'`;
        issues++;
      }
    }
  }
  return { sent, issues };
}
