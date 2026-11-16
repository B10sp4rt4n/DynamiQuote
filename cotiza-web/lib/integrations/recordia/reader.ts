import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { resolveBusiness } from "@/lib/db/opportunity-workspace";
import { revalidateRecordiaActor } from "./access";
import { RecordiaError, type RecordiaActor, type RecordiaEvidence, type RecordiaMemory } from "./domain";

const CAP = 100;
type Source = { kind: string; id: string; time: Date | null; title: string; description?: string | null;
  context?: Record<string, unknown>; epistemic?: RecordiaMemory["epistemic_status"]; href?: string; eventId?: string; decisionId?: string };

export function projectRecordiaSource(opportunityId: string, source: Source): { memory: RecordiaMemory; evidence: RecordiaEvidence } {
  const id = `${source.kind}:${source.id}`;
  const memory: RecordiaMemory = {
    id, aup_id: opportunityId, memory_type: source.decisionId ? "decision_record" : "milestone",
    title: source.title, description: source.description ?? null, context: source.context ?? {},
    evidence_ids: [`cotiza:${id}`], event_id: source.eventId ?? null, decision_id: source.decisionId ?? null,
    source_connector: "cotiza", recorded_at_utc: source.time?.toISOString() ?? null, content_kind: "source_projection",
    epistemic_status: source.epistemic ?? "observed_fact", integrity_status: "not_verified",
    source: { kind: source.kind, id: source.id, href: source.href ?? null },
  };
  return { memory, evidence: {
    id: `cotiza:${id}`, source_connector: "cotiza", source_id: source.id, source_kind: source.kind,
    recorded_at_utc: memory.recorded_at_utc,
    // Fingerprint of the returned projection only: not a stored source hash or custody proof.
    projection_hash: createHash("sha256").update(JSON.stringify(memory)).digest("hex"),
    projection_hash_algorithm: "sha256", integrity_status: "not_verified",
  } };
}

export async function readRecordiaDossier(actor: RecordiaActor, opportunityId: string) {
  await revalidateRecordiaActor(actor);
  const business = await resolveBusiness(actor.tenantId, opportunityId, { userId: actor.actorId, canSeeAll: true });
  if (!business || business.opportunity.opportunityId !== opportunityId) throw new RecordiaError("Expediente no encontrado", 404);
  const { ids } = business;
  const [opportunities, quotes, notes] = await Promise.all([
    prisma.opportunities.findMany({ where: { tenant_id: actor.tenantId, opportunity_id: { in: ids } },
      orderBy: [{ created_at: "desc" }, { opportunity_id: "asc" }], take: CAP + 1,
      select: { opportunity_id: true, opportunity_number: true, created_at: true, closed_at: true } }),
    prisma.quote.findMany({ where: { tenantId: actor.tenantId, opportunity_id: { in: ids } },
      orderBy: [{ createdAt: "desc" }, { quote_id: "asc" }], take: CAP + 1,
      select: { quote_id: true, quote_group_id: true, version: true, createdAt: true, created_by_user_id: true } }),
    prisma.interaction_logs.findMany({ where: { tenant_id: actor.tenantId, opportunity_id: { in: ids } },
      orderBy: [{ created_at: "desc" }, { interaction_id: "asc" }], take: CAP + 1,
      select: { interaction_id: true, created_at: true, created_by_user_id: true, note: true } }),
  ]);
  const proposals = await prisma.proposals.findMany({ where: { tenant_id: actor.tenantId,
    OR: [{ opportunity_id: { in: ids } }, { opportunity_id: null, origin: { in: quotes.slice(0, CAP).map(q => q.quote_id) } }] },
    orderBy: [{ created_at: "desc" }, { proposal_id: "asc" }], take: CAP + 1,
    select: { proposal_id: true, created_at: true, created_by_user_id: true } });
  const proposalIds = proposals.slice(0, CAP).map(p => p.proposal_id);
  const [events, approvals] = proposalIds.length ? await Promise.all([
    prisma.proposal_audit_events.findMany({ where: { tenant_id: actor.tenantId, proposal_id: { in: proposalIds } },
      orderBy: [{ created_at: "desc" }, { event_id: "asc" }], take: CAP + 1,
      select: { event_id: true, event_type: true, proposal_id: true, created_at: true } }),
    prisma.proposal_approvals.findMany({ where: { tenant_id: actor.tenantId, proposal_id: { in: proposalIds } },
      orderBy: [{ created_at: "desc" }, { approval_id: "asc" }], take: CAP + 1,
      select: { approval_id: true, proposal_id: true, approver_user_id: true, decision: true, created_at: true } }),
  ]) : [[], []];
  const sources: Source[] = [
    ...opportunities.slice(0, CAP).flatMap(o => [
      { kind: "opportunity_created", id: o.opportunity_id, time: o.created_at, title: "Oportunidad registrada", context: { folio: o.opportunity_number } },
      ...(o.closed_at ? [{ kind: "opportunity_closed", id: o.opportunity_id, time: o.closed_at, title: "Fecha de cierre registrada" }] : []),
    ]),
    ...quotes.slice(0, CAP).map(q => ({ kind: "quote_created", id: q.quote_id, time: q.createdAt, title: "Cotización registrada",
      context: { folio: q.quote_group_id, version: q.version, actor_id: q.created_by_user_id }, href: `/cotizaciones?quoteId=${encodeURIComponent(q.quote_id)}` })),
    ...proposals.slice(0, CAP).map(p => ({ kind: "proposal_created", id: p.proposal_id, time: p.created_at, title: "Propuesta registrada",
      context: { actor_id: p.created_by_user_id }, href: `/propuestas/${encodeURIComponent(p.proposal_id)}` })),
    ...notes.slice(0, CAP).map(n => ({ kind: "interaction", id: n.interaction_id, time: n.created_at, title: "Nota comercial registrada",
      description: n.note.slice(0, 4000), context: { actor_id: n.created_by_user_id, text_truncated: n.note.length > 4000 }, epistemic: "recorded_claim" as const })),
    ...events.slice(0, CAP).map(e => ({ kind: "proposal_event", id: e.event_id, time: e.created_at, title: "Evento de propuesta registrado",
      context: { event_type: e.event_type, proposal_id: e.proposal_id }, eventId: e.event_id,
      href: `/propuestas/${encodeURIComponent(e.proposal_id)}` })),
    ...approvals.slice(0, CAP).map(a => ({ kind: "approval", id: a.approval_id, time: a.created_at, title: "Decisión de aprobación registrada",
      context: { decision: a.decision, actor_id: a.approver_user_id, proposal_id: a.proposal_id }, decisionId: a.approval_id,
      epistemic: "decision" as const, href: `/propuestas/${encodeURIComponent(a.proposal_id)}` })),
  ];
  const projected = sources.map(source => projectRecordiaSource(opportunityId, source))
    .sort((a, b) => (b.memory.recorded_at_utc ?? "").localeCompare(a.memory.recorded_at_utc ?? "") || a.memory.id.localeCompare(b.memory.id));
  // Revocation while the source queries run must prevent releasing their result.
  await revalidateRecordiaActor(actor);
  return { projected, source_truncated: [opportunities, quotes, proposals, notes, events, approvals].some(rows => rows.length > CAP),
    captured_at_utc: new Date().toISOString() };
}
