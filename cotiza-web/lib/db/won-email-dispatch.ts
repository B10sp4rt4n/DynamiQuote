import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { getWonPolicy } from "./won-notifications";
import { eligibleWonUsers } from "./won-delivery-queue";
import { deliveryFlags, renderWonMessage, wonEventSchema } from "@/lib/notifications/won-message";
import { getWonMailTransport, type WonMailTransport } from "@/lib/email/won-notification";
import { getPublicAppUrl } from "@/lib/utils/app-url";
const envelopeSchema = z.object({ from: z.string(), to: z.email(), subject: z.string(), text: z.string() });
export const WON_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const WON_MAX_ATTEMPTS = 4;
type Delivery = {
  delivery_id: string; tenant_id: string; source_event_id: string; proposal_id: string; opportunity_id: string;
  normalized_email: string; recipient_ids: string[]; reasons: ("opportunity_owner" | "tenant_designated")[];
  message: unknown; idempotency_key: string; state: string; attempt_count: number;
  first_attempt_at: Date | null; lease_token: string | null;
};
async function claim(tenantId: string, now: Date): Promise<Delivery | null> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Delivery[]>`SELECT * FROM won_email_deliveries
      WHERE tenant_id=${tenantId} AND ((state='pending' AND next_attempt_at<=${now}) OR (state='sending' AND lease_until<=${now}))
      ORDER BY next_attempt_at,delivery_id FOR UPDATE SKIP LOCKED LIMIT 1`;
    const row = rows[0]; if (!row) return null;
    if (row.state === "sending") await tx.$executeRaw`UPDATE won_email_attempts SET state='uncertain',finished_at=${now},error_code='lease_expired'
      WHERE delivery_id=${row.delivery_id} AND attempt_number=${row.attempt_count} AND state='sending'`;
    // The provider remembers keys for 24h. Never retry outside our smaller window.
    if (row.attempt_count >= WON_MAX_ATTEMPTS || (row.first_attempt_at && now.getTime()-row.first_attempt_at.getTime() >= WON_RETRY_WINDOW_MS)) {
      await tx.$executeRaw`UPDATE won_email_deliveries SET state='uncertain',last_error_code='manual_reconciliation_required',lease_token=NULL,lease_until=NULL WHERE delivery_id=${row.delivery_id}`;
      return null;
    }
    const token = randomUUID(), attempt = row.attempt_count + 1;
    const updated = await tx.$queryRaw<Delivery[]>`UPDATE won_email_deliveries SET state='sending',lease_token=${token},lease_until=${new Date(now.getTime()+120000)},
      attempt_count=${attempt},first_attempt_at=COALESCE(first_attempt_at,${now}) WHERE delivery_id=${row.delivery_id} RETURNING *`;
    await tx.$executeRaw`INSERT INTO won_email_attempts(attempt_id,delivery_id,attempt_number,started_at,state)
      VALUES (${randomUUID()},${row.delivery_id},${attempt},${now},'sending')`;
    return updated[0];
  });
}
async function finish(row: Delivery, state: "sent" | "pending" | "failed" | "suppressed" | "uncertain", code: string | null, providerId: string | null, now: Date) {
  return prisma.$transaction(async tx => {
    const delay = [60000,300000,900000][Math.min(row.attempt_count-1,2)];
    const updated = await tx.$executeRaw`UPDATE won_email_deliveries SET state=${state},last_error_code=${code},provider_message_id=COALESCE(${providerId},provider_message_id),
      sent_at=CASE WHEN ${state}='sent' THEN ${now} ELSE sent_at END,next_attempt_at=${new Date(now.getTime()+delay)},lease_token=NULL,lease_until=NULL
      WHERE delivery_id=${row.delivery_id} AND tenant_id=${row.tenant_id} AND lease_token=${row.lease_token} AND state='sending'`;
    if (updated) await tx.$executeRaw`UPDATE won_email_attempts SET state=${state === "pending" ? "failed" : state},error_code=${code},provider_message_id=${providerId},finished_at=${now}
      WHERE delivery_id=${row.delivery_id} AND attempt_number=${row.attempt_count} AND state='sending'`;
    return updated > 0;
  });
}
// The optional dependency is test injection, never exposed through an API request.
export async function processWonEmails(tenantId: string, options: { transport?: WonMailTransport; now?: Date; limit?: number } = {}) {
  if (!deliveryFlags().email) return { mode: "paused", processed: 0 };
  const limit = Math.max(1,Math.min(options.limit ?? 2,5)); let processed = 0;
  for (let i=0;i<limit;i++) {
    const now = options.now ?? new Date();
    const row = await claim(tenantId,now); if (!row) break;
    try {
      const stored = await prisma.proposal_audit_events.findFirst({ where: { event_id: row.source_event_id, tenant_id: tenantId, proposal_id: row.proposal_id, event_type: "opportunity.closed_won" } });
      const parsed = wonEventSchema.safeParse(JSON.parse(stored?.payload ?? "null"));
      if (!parsed.success || parsed.data.event_id !== row.source_event_id || parsed.data.tenant_id !== tenantId || parsed.data.opportunity.winning_proposal.id !== row.proposal_id || parsed.data.opportunity_id !== row.opportunity_id) {
        await finish(row,"suppressed","invalid_source_event",null,now); processed++;continue;
      }
      const event = parsed.data;
      const [policy, users] = await Promise.all([getWonPolicy(tenantId), eligibleWonUsers(prisma,event)]);
      const owner = await prisma.opportunities.findFirst({ where: { tenant_id: tenantId, opportunity_id: event.opportunity_id },select:{owner_user_id:true} });
      const authorized = users.some(u => row.recipient_ids.includes(u.user_id) && u.email?.trim().toLowerCase() === row.normalized_email &&
        ((policy.includeOwner && owner?.owner_user_id === u.user_id) || policy.designatedUserIds.includes(u.user_id)));
      if (!policy.enabled || !authorized) { await finish(row,"suppressed","recipient_no_longer_eligible",null,now); processed++;continue; }
      const transport = options.transport ?? await getWonMailTransport();
      const url = getPublicAppUrl();
      if (!transport || !url.ok || !/^https?:\/\//.test(url.url)) { await finish(row,"pending","email_configuration_missing",null,now); processed++;continue; }
      const rendered = renderWonMessage(event,row.reasons,url.url);
      let message = { from:transport.from,to:row.normalized_email,subject:rendered.subject,text:rendered.text };
      if (row.message) {
        const frozen=envelopeSchema.safeParse(row.message);
        if (!frozen.success || frozen.data.from !== transport.from || frozen.data.to !== row.normalized_email) {
          await finish(row,"suppressed","envelope_configuration_changed",null,now); processed++;continue;
        }
        message=frozen.data;
      } else {
        const saved=await prisma.$executeRaw`UPDATE won_email_deliveries SET message=${JSON.stringify(message)}::jsonb
          WHERE delivery_id=${row.delivery_id} AND lease_token=${row.lease_token} AND state='sending' AND message IS NULL`;
        if (!saved) continue;
      }
      // A flag may have been disabled since this worker claimed the row.
      if (!deliveryFlags().email) { await finish(row,"pending","delivery_paused",null,now); break; }
      const result=await transport.send(message,row.idempotency_key);
      if (result.kind === "sent") await finish(row,"sent",null,result.id,now);
      else await finish(row,result.kind === "retry" ? row.attempt_count >= WON_MAX_ATTEMPTS ? "uncertain" : "pending" : "failed",result.code,null,now);
      processed++;
    } catch {
      // A provider success followed by a DB failure retains the same frozen envelope/key.
      // A retry can reconcile within 23h; it must never use a new key automatically.
      await finish(row,row.attempt_count >= WON_MAX_ATTEMPTS ? "uncertain" : "pending","processing_result_unknown",null,now);
      processed++;
    }
  }
  return { mode:"live",processed };
}
