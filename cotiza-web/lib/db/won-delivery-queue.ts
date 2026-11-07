import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { deliveryFlags, renderWonMessage, wonEventSchema, type WonEvent } from "@/lib/notifications/won-message";
import { emailPreview } from "@/lib/notifications/won";

// An administrator designation never grants document access.
export async function eligibleWonUsers(tx: Prisma.TransactionClient, event: WonEvent) {
  const tenant=await tx.tenant.findFirst({where:{tenant_id:event.tenant_id,active:true},select:{tenant_id:true}});
  if(!tenant)return [];
  const proposal = await tx.proposals.findFirst({ where: { tenant_id: event.tenant_id, proposal_id: event.opportunity.winning_proposal.id }, select: { created_by_user_id: true } });
  const opportunity = await tx.opportunities.findFirst({ where: { tenant_id: event.tenant_id, opportunity_id: event.opportunity_id }, select: { owner_user_id: true } });
  if (!proposal || !opportunity) return [];
  const users = await tx.app_users.findMany({ where: { tenant_id: event.tenant_id, active: true, user_id: { in: event.notification.recipients.map(r => r.user_id) } }, select: { user_id: true, role: true, email: true } });
  return users.filter(user => ["owner", "admin", "superadmin"].includes(user.role) ||
    (opportunity.owner_user_id === user.user_id && (proposal.created_by_user_id === null || proposal.created_by_user_id === user.user_id)));
}
export async function enqueueWonDelivery(tx: Prisma.TransactionClient, input: unknown) {
  const flags = deliveryFlags(); if (!flags.email && !flags.inApp) return;
  const event = wonEventSchema.parse(input);
  const users = await eligibleWonUsers(tx, event);
  const recipients = event.notification.recipients.filter(r => users.some(u => u.user_id === r.user_id));
  if (flags.inApp) for (const recipient of recipients.filter(r => r.channels.includes("in_app"))) {
    const rendered = renderWonMessage(event, recipient.reasons);
    await tx.$executeRaw`INSERT INTO won_in_app_notifications
      (notification_id,tenant_id,source_event_id,proposal_id,opportunity_id,recipient_user_id,reasons,subject,body,link_path)
      VALUES (${randomUUID()},${event.tenant_id},${event.event_id},${event.opportunity.winning_proposal.id},${event.opportunity_id},${recipient.user_id},${JSON.stringify(recipient.reasons)}::jsonb,${rendered.subject},${rendered.text},${rendered.linkPath})
      ON CONFLICT(source_event_id,recipient_user_id) DO NOTHING`;
  }
  if (flags.email) for (const mailbox of emailPreview(recipients, users)) {
    const key = "won/" + event.event_id + "/" + createHash("sha256").update(mailbox.email).digest("hex");
    await tx.$executeRaw`INSERT INTO won_email_deliveries
      (delivery_id,tenant_id,source_event_id,proposal_id,opportunity_id,normalized_email,recipient_ids,reasons,idempotency_key)
      VALUES (${randomUUID()},${event.tenant_id},${event.event_id},${event.opportunity.winning_proposal.id},${event.opportunity_id},${mailbox.email},${JSON.stringify(mailbox.userIds)}::jsonb,${JSON.stringify(mailbox.reasons)}::jsonb,${key})
      ON CONFLICT(source_event_id,normalized_email) DO NOTHING`;
  }
}
