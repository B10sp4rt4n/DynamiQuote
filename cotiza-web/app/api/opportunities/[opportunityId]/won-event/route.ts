import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { resolveBusiness } from "@/lib/db/opportunity-workspace";
import { prisma } from "@/lib/db/prisma";
import { emailPreview, reasonLabel, type Recipient } from "@/lib/notifications/won";
import { wonPolicyUsers } from "@/lib/db/won-notifications";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
export async function GET(request: Request, context: { params: Promise<{ opportunityId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (process.env.COTIZA_WON_EVENT_PILOT !== "true") return NextResponse.json({ error: "Piloto todavía no habilitado" }, { status: 503 });
  const limit = enforceRateLimit(`won-export:${tenant.id}:${tenant.userId}`, 40, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Intenta en un momento" }, { status: 429 });
  const canSeeAll = tenant.isSuperAdmin || ["owner", "admin"].includes(tenant.userRole);
  const { opportunityId } = await context.params;
  const business = await resolveBusiness(tenant.id, opportunityId, { userId: tenant.userId, canSeeAll });
  if (!business) return NextResponse.json({ error: "Oportunidad no encontrada" }, { status: 404 });
  const quotes = await prisma.quote.findMany({ where: { tenantId: tenant.id, opportunity_id: { in: business.ids },
    ...(canSeeAll ? {} : { created_by_user_id: tenant.userId }) }, select: { quote_id: true } });
  const proposals = await prisma.proposals.findMany({ where: { tenant_id: tenant.id,
    OR: [{ opportunity_id: { in: business.ids } }, { opportunity_id: null, origin: { in: quotes.map(q => q.quote_id) } }],
    ...(canSeeAll ? {} : { created_by_user_id: tenant.userId }) }, select: { proposal_id: true } });
  const event = await prisma.proposal_audit_events.findFirst({ where: { tenant_id: tenant.id,
    proposal_id: { in: proposals.map(p => p.proposal_id) }, event_type: "opportunity.closed_won" }, orderBy: [{ created_at: "desc" }, { event_id: "desc" }] });
  if (!event?.payload) return NextResponse.json({ error: "Este negocio todavía no tiene evento de cierre del piloto. Los cierres anteriores no se recrean." }, { status: 404 });
  const payload = JSON.parse(event.payload);
  // Recipients are internal operational data: ordinary users see only their own entry.
  const recipients: Recipient[] = payload.notification.recipients;
  if (!canSeeAll) payload.notification.recipients = recipients.filter(r => r.user_id === tenant.userId);
  const headers = { "Cache-Control": "private, no-store" };
  if (new URL(request.url).searchParams.get("download") === "1") {
    await prisma.proposal_audit_events.create({ data: { event_id: crypto.randomUUID(), event_hash: crypto.randomUUID(),
      tenant_id: tenant.id, proposal_id: event.proposal_id, created_at: new Date(), event_type: "won_event_exported",
      payload: JSON.stringify({ actorUserId: tenant.userId, sourceEventId: event.event_id, projection: canSeeAll ? "admin" : "self" }) } });
    return NextResponse.json(payload, { headers: { ...headers, "Content-Disposition": `attachment; filename="cierre-${event.event_id}.json"` } });
  }
  const users = await wonPolicyUsers(tenant.id);
  const active = payload.notification.recipients.filter((r: Recipient) => users.some(u => u.user_id === r.user_id));
  const mailboxes = emailPreview(active, users);
  const subject = `Oportunidad ganada · ${payload.opportunity.folio}`;
  const text = `${payload.opportunity.title}\nCliente: ${payload.opportunity.customer.name}\nImporte neto: ${payload.opportunity.winning_proposal.amount} ${payload.opportunity.winning_proposal.currency}\nFecha comercial de cierre: ${payload.closed_on}\nRegistrado: ${payload.occurred_at}\nVer oportunidad: /oportunidades/${encodeURIComponent(payload.opportunity_id)}`;
  return NextResponse.json({ event: payload, mode: "dry_run", subject, text,
    emails: mailboxes.map(m => ({ ...m, reasons: m.reasons.map(r => reasonLabel[r]) })),
    inApp: active.map((r: Recipient) => ({ userId: r.user_id, reasons: r.reasons.map(reason => reasonLabel[reason]) })),
    missingEmailCount: active.filter((r: Recipient) => !mailboxes.some(m => m.userIds.includes(r.user_id))).length,
    message: "Vista previa. No se ha enviado correo ni publicado una notificación interna." }, { headers });
}
