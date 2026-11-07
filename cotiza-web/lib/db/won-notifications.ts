import "server-only";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { mexicoCalendarDate } from "@/lib/domain/commercial-close-date";
import { wonPolicySchema, wonRecipients, type WonPolicy } from "@/lib/notifications/won";

export async function getWonPolicy(tenantId: string, tx: Prisma.TransactionClient = prisma): Promise<WonPolicy> {
  // No schema mutation during application requests. The deployment gate must run the migration.
  const rows = await tx.$queryRaw<Array<{ enabled: boolean; include_owner: boolean; designated_user_ids: unknown; version: number }>>`
    SELECT enabled, include_owner, designated_user_ids, version FROM opportunity_won_notification_policies WHERE tenant_id=${tenantId}`;
  if (!rows[0]) return { enabled: false, includeOwner: true, designatedUserIds: [], version: 1 };
  const row = rows[0];
  return { ...wonPolicySchema.parse({ enabled: row.enabled, includeOwner: row.include_owner, designatedUserIds: row.designated_user_ids }), version: row.version };
}
export async function wonPolicyUsers(tenantId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.app_users.findMany({ where: { tenant_id: tenantId, active: true },
    select: { user_id: true, first_name: true, last_name: true, email: true }, orderBy: { first_name: "asc" } });
}
export async function saveWonPolicy(tenantId: string, actorId: string, input: unknown) {
  const policy = wonPolicySchema.parse(input);
  return prisma.$transaction(async tx => {
    const users = await wonPolicyUsers(tenantId, tx);
    if (policy.designatedUserIds.some(id => !users.some(u => u.user_id === id))) throw new Error("Selecciona usuarios activos de esta empresa");
    await tx.$executeRaw`INSERT INTO opportunity_won_notification_policies
      (tenant_id, enabled, include_owner, designated_user_ids, updated_by)
      VALUES (${tenantId},${policy.enabled},${policy.includeOwner},${JSON.stringify(policy.designatedUserIds)}::jsonb,${actorId})
      ON CONFLICT(tenant_id) DO UPDATE SET enabled=excluded.enabled, include_owner=excluded.include_owner,
      designated_user_ids=excluded.designated_user_ids, updated_by=excluded.updated_by, updated_at=now(),
      version=opportunity_won_notification_policies.version+1`;
    return getWonPolicy(tenantId, tx);
  });
}

// Called only on a new won transition, under the existing tenant business-win lock.
// Stores an immutable snapshot in the SAME transaction as the commercial decision.
// This pilot has no transport: emails and internal notifications are previews only.
export async function captureWonEvent(tx: Prisma.TransactionClient, proposal: {
  tenant_id: string; proposal_id: string; opportunity_id: string | null; origin: string | null;
  outcome: string | null;
}, actorId: string | null, closedAt: Date, now: Date) {
  if (process.env.COTIZA_WON_EVENT_PILOT !== "true") return;
  const policy = await getWonPolicy(proposal.tenant_id, tx);
  if (!policy.enabled) return;
  const quote = proposal.origin ? await tx.quote.findFirst({ where: { quote_id: proposal.origin, tenantId: proposal.tenant_id } }) : null;
  const opportunityId = proposal.opportunity_id ?? quote?.opportunity_id;
  const opportunity = opportunityId ? await tx.opportunities.findFirst({ where: { opportunity_id: opportunityId, tenant_id: proposal.tenant_id } }) : null;
  const client = opportunity?.client_id ? await tx.client.findFirst({ where: { client_id: opportunity.client_id, tenant_id: proposal.tenant_id } }) : null;
  const formal = await tx.formal_proposals.findFirst({ where: { proposal_id: proposal.proposal_id, tenant_id: proposal.tenant_id }, orderBy: { created_at: "desc" } });
  const winningQuote = formal?.quote_id ? await tx.quote.findFirst({ where: { quote_id: formal.quote_id, tenantId: proposal.tenant_id } }) : quote;
  const eventId = randomUUID();
  if (!opportunity || !opportunity.owner_user_id || !client || !formal || !winningQuote || !actorId || !formal.currency || !/^[A-Z]{3}$/.test(formal.currency) || !client.company.trim() || (winningQuote.version ?? 1) < 1 || winningQuote.client_id !== client.client_id || (winningQuote.opportunity_id !== opportunityId && winningQuote.opportunity_id !== null)) {
    await tx.proposal_audit_events.create({ data: { event_id: eventId, event_hash: randomUUID(), tenant_id: proposal.tenant_id,
      proposal_id: proposal.proposal_id, created_at: now, event_type: "opportunity_won_incomplete",
      payload: JSON.stringify({ actorUserId: actorId, opportunityId, reason: "Completar oportunidad, cliente, propuesta formal, cotización, moneda y actor antes de integrar este cierre", deliveryMode: "dry_run" }) } });
    return;
  }
  const users = await wonPolicyUsers(proposal.tenant_id, tx);
  // Count by opportunity, including previous winning proposals/versions. Serialized by tenant lock.
  const previous = await tx.proposal_audit_events.findMany({ where: { tenant_id: proposal.tenant_id, event_type: "opportunity.closed_won" }, select: { payload: true } });
  const sequence = 1 + previous.filter(e => {
    try { return JSON.parse(e.payload ?? "{}").opportunity_id === opportunityId; } catch { return false; }
  }).length;
  const items = await tx.proposal_items.aggregate({ where: { tenant_id: proposal.tenant_id, proposal_id: proposal.proposal_id, status: { not: "deleted" } }, _sum: { subtotal_price: true } });
  const amount = (items._sum.subtotal_price ?? new Prisma.Decimal(0)).toFixed(4);
  if (!/^[0-9]+(?:\.[0-9]{1,4})?$/.test(amount)) {
    await tx.proposal_audit_events.create({ data: { event_id: eventId, event_hash: randomUUID(), tenant_id: proposal.tenant_id,
      proposal_id: proposal.proposal_id, created_at: now, event_type: "opportunity_won_incomplete",
      payload: JSON.stringify({ actorUserId: actorId, opportunityId, reason: "Revisar importe neto incompatible con el contrato JSON", deliveryMode: "dry_run" }) } });
    return;
  }
  const payload = {
    schema_version: "1.0.0", event_id: eventId, event_type: "opportunity.closed_won", tenant_id: proposal.tenant_id,
    opportunity_id: opportunityId, closure_sequence: sequence,
    deduplication_key: `${proposal.tenant_id}:${opportunityId}:${sequence}:opportunity.closed_won`,
    occurred_at: now.toISOString(), closed_on: mexicoCalendarDate(closedAt), tenant_timezone: "America/Mexico_City",
    actor_user_id: actorId, previous_status: proposal.outcome ?? "open", current_status: "closed_won",
    opportunity: { folio: opportunity.opportunity_number, title: opportunity.title,
      owner_user_id: opportunity.owner_user_id!,
      customer: { id: client.client_id, name: client.company },
      winning_proposal: { id: proposal.proposal_id, folio: formal.proposal_number, version: winningQuote.version ?? 1,
        amount: amount, currency: formal.currency, amount_basis: "net_before_tax" } },
    notification: { policy_id: `won:${proposal.tenant_id}`, policy_version: policy.version,
      recipients: wonRecipients(opportunity.owner_user_id, policy, users.map(u => u.user_id)) },
  };
  await tx.proposal_audit_events.create({ data: { event_id: eventId, event_hash: randomUUID(), tenant_id: proposal.tenant_id,
    proposal_id: proposal.proposal_id, created_at: now, event_type: "opportunity.closed_won", payload: JSON.stringify(payload) } });
}
