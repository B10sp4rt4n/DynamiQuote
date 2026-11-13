import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hasAnotherBusinessWin } from "./commercial-win-guard";
import { applicableRules, isSatisfied, mayApprove, winPolicySchema, type WinAction, type WinActor, type WinCase, type WinPolicyVersion, type WinView } from "@/lib/domain/won-consolidation";
import { closeDateInstant, earliestCommercialStart, isValidCloseDate, mexicoCalendarDate } from "@/lib/domain/commercial-close-date";

type Tx = Prisma.TransactionClient;
export class WinError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export async function lockWinPolicy(tx: Tx, tenantId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`win-policy:${tenantId}`}, 0))::text`;
}
export async function readWinPolicy(tx: Tx, tenantId: string): Promise<WinPolicyVersion> {
  const rows = await tx.$queryRaw<{ revision: number; policy: unknown }[]>`SELECT revision, policy FROM win_policies WHERE tenant_id=${tenantId}`;
  const row = rows?.[0];
  return row ? { ...winPolicySchema.parse(row.policy), revision: row.revision } : { rules: [], revision: 0 };
}
export function getWinPolicy(tenantId: string) { return readWinPolicy(prisma, tenantId); }
async function readCase(tx: Tx, tenantId: string, proposalId: string): Promise<WinCase | null> {
  const rows = await tx.$queryRaw<{ snapshot: WinCase }[]>`SELECT snapshot FROM win_cases WHERE tenant_id=${tenantId} AND proposal_id=${proposalId}`;
  return rows?.[0]?.snapshot ?? null;
}
async function audit(tx: Tx, tenantId: string, proposalId: string, actorId: string, type: string, payload: object) {
  await tx.proposal_audit_events.create({ data: { event_id: randomUUID(), event_hash: randomUUID(), tenant_id: tenantId, proposal_id: proposalId,
    created_at: new Date(), event_type: type, payload: JSON.stringify({ ...payload, actorUserId: actorId }) } });
}
async function saveCase(tx: Tx, tenantId: string, proposalId: string, value: WinCase, actorId: string, action: string) {
  await tx.$executeRaw`INSERT INTO win_cases(tenant_id,proposal_id,revision,snapshot) VALUES(${tenantId},${proposalId},${value.revision},${JSON.stringify(value)}::jsonb)
    ON CONFLICT(tenant_id,proposal_id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot`;
  await audit(tx, tenantId, proposalId, actorId, "win_consolidation", { action, snapshot: value });
}
// Call under the proposal row lock. Historical wins without a case are untouched.
export async function invalidateWinCase(tx: Tx, tenantId: string, proposalId: string, actorId: string, reason: string) {
  const current = await readCase(tx, tenantId, proposalId);
  if (!current || current.cancelledAt) return;
  if (reason === "document_changed" && current.consolidatedAt) throw new WinError("Retira primero el resultado ganado antes de cambiar el documento consolidado");
  await saveCase(tx, tenantId, proposalId, { ...current, revision: current.revision + 1, cancelledAt: new Date().toISOString() }, actorId, reason);
}
// Direct outcome PATCH cannot bypass either the current policy or a pinned open circuit.
export async function requiresWinCircuit(tx: Tx, tenantId: string, proposalId: string) {
  const policy = await readWinPolicy(tx, tenantId);
  const current = await readCase(tx, tenantId, proposalId);
  return policy.rules.length > 0 || Boolean(current && !current.cancelledAt);
}
async function liveActor(tx: Tx, tenantId: string, actor: WinActor): Promise<WinActor> {
  const user = await tx.app_users.findFirst({ where: { user_id: actor.userId, active: true }, select: { tenant_id: true, role: true } });
  if (!user || !(user.tenant_id === tenantId || (actor.isSuperAdmin && user.role === "superadmin"))) throw new WinError("Sin acceso a esta empresa", 403);
  if (!["owner", "admin", "user", "superadmin"].includes(user.role)) throw new WinError("Rol no autorizado", 403);
  return { userId: actor.userId, userRole: user.role as WinActor["userRole"], isSuperAdmin: actor.isSuperAdmin && user.role === "superadmin" };
}
function canManage(actor: WinActor) { return actor.isSuperAdmin || actor.userRole === "owner"; }
function canSeeAll(actor: WinActor) { return canManage(actor) || actor.userRole === "admin"; }
async function document(tx: Tx, tenantId: string, proposalId: string, actor: WinActor) {
  const proposal = await tx.proposals.findFirst({ where: { tenant_id: tenantId, proposal_id: proposalId } });
  if (!proposal) throw new WinError("Propuesta no encontrada", 404);
  if (!canSeeAll(actor) && proposal.created_by_user_id !== actor.userId) {
    const current = await readCase(tx, tenantId, proposalId);
    if (!current || !current.rules.some(rule => mayApprove(rule, actor, proposal.created_by_user_id))) throw new WinError("Propuesta no encontrada", 404);
  }
  const [items, formal, integrated] = await Promise.all([
    tx.proposal_items.findMany({ where: { tenant_id: tenantId, proposal_id: proposalId, status: { not: "deleted" } }, orderBy: [{ item_number: "asc" }, { item_id: "asc" }],
      select: { item_id: true, item_number: true, sku: true, description: true, quantity: true, cost_unit: true, price_unit: true, subtotal_cost: true, subtotal_price: true, origin: true, component_type: true } }),
    tx.formal_proposals.findMany({ where: { tenant_id: tenantId, proposal_id: proposalId }, orderBy: [{ created_at: "desc" }, { proposal_doc_id: "asc" }],
      select: { proposal_doc_id: true, quote_id: true, recipient_company: true, recipient_email: true, recipient_contact_name: true, currency: true, terms_and_conditions: true, subject: true, custom_intro: true, objective: true, valid_until: true, iva_rate: true, iva_included: true } }),
    tx.proposal_integrated_node.findFirst({ where: { tenant_id: tenantId, proposal_id: proposalId }, select: { total_price: true } }),
  ]);
  const fingerprint = createHash("sha256").update(JSON.stringify({ status: proposal.status, origin: proposal.origin, opportunity: proposal.opportunity_id,
    owner: proposal.created_by_user_id, items, formal, total: integrated?.total_price ?? null })).digest("hex");
  return { proposal, fingerprint, amount: integrated?.total_price === null || integrated?.total_price === undefined ? null : Number(integrated.total_price), currency: formal[0]?.currency ?? null };
}
export async function listWinCases(tenantId: string, inputActor: WinActor) {
  return prisma.$transaction(async tx => {
    const actor = await liveActor(tx, tenantId, inputActor);
    const rows = await tx.$queryRaw<{ proposal_id: string; snapshot: WinCase; created_by_user_id: string | null; outcome: string | null }[]>`
      SELECT c.proposal_id,c.snapshot,p.created_by_user_id,p.outcome FROM win_cases c
      JOIN proposals p ON p.tenant_id=c.tenant_id AND p.proposal_id=c.proposal_id
      WHERE c.tenant_id=${tenantId} ORDER BY (c.snapshot->>'acceptedAt') DESC`;
    return rows.filter(row => canSeeAll(actor) || row.created_by_user_id === actor.userId || row.snapshot.rules.some(rule => mayApprove(rule, actor, row.created_by_user_id)))
      .map(row => ({ proposalId: row.proposal_id, acceptedOn: row.snapshot.acceptedOn,
        state: row.outcome === "won" ? "Ganada consolidada" : row.snapshot.cancelledAt ? "Aceptación retirada" : "Pendiente de consolidación" }));
  });
}
function project(tenantId: string, proposalId: string, policy: WinPolicyVersion, current: WinCase | null, doc: Awaited<ReturnType<typeof document>>, actor: WinActor): WinView {
  const seller = doc.proposal.created_by_user_id;
  const owns = canSeeAll(actor) || seller === actor.userId;
  const stale = current !== null && (current.fingerprint !== doc.fingerprint || doc.proposal.status !== "approved");
  const state: WinView["state"] = doc.proposal.outcome === "won" ? current?.consolidatedAt ? "consolidated" : "legacy" :
    !current ? "not_accepted" : current.cancelledAt ? "cancelled" : stale ? "stale" :
    Object.values(current.decisions).some(d => d.decision === "rejected") ? "blocked" : "pending";
  const active = state === "pending" || state === "blocked";
  const requirements = (current?.rules ?? []).map(rule => ({ ...rule, decision: current?.decisions[rule.id] ?? null,
    waitingFor: rule.dependsOn.filter(id => !isSatisfied(current?.decisions[id])),
    canDecide: active && mayApprove(rule, actor, seller),
    canWaive: active && rule.allowWaiver && canManage(actor) && (rule.allowSelfApproval || (seller !== null && seller !== actor.userId)),
  }));
  return { tenantId, proposalId, policy, case: current, state, requirements,
    canRecordAcceptance: owns && doc.proposal.status === "approved" && !doc.proposal.outcome && ["not_accepted", "cancelled", "stale"].includes(state),
    canCancel: owns && current !== null && !current.cancelledAt && !current.consolidatedAt,
    canConsolidate: owns && state === "pending" && requirements.every(r => isSatisfied(r.decision)),
  };
}
async function withPeople(tx: Tx, tenantId: string, view: WinView): Promise<WinView> {
  const ids = [...new Set([view.case?.acceptedBy, ...view.requirements.flatMap(r => [...r.approverUserIds, r.decision?.actorId])].filter((id): id is string => Boolean(id)))];
  const users = ids.length ? await tx.app_users.findMany({ where: { tenant_id: tenantId, user_id: { in: ids } }, select: { user_id: true, first_name: true, last_name: true } }) : [];
  return { ...view, people: Object.fromEntries(users.map(u => [u.user_id, `${u.first_name} ${u.last_name}`.trim() || "Responsable registrado"])) };
}
export async function getWinView(tenantId: string, proposalId: string, inputActor: WinActor): Promise<WinView> {
  return prisma.$transaction(async tx => {
    const actor = await liveActor(tx, tenantId, inputActor);
    const [policy, current, doc] = await Promise.all([readWinPolicy(tx, tenantId), readCase(tx, tenantId, proposalId), document(tx, tenantId, proposalId, actor)]);
    return withPeople(tx, tenantId, project(tenantId, proposalId, policy, current, doc, actor));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function saveWinPolicy(tenantId: string, inputActor: WinActor, policy: unknown, expectedRevision: number): Promise<WinPolicyVersion> {
  const parsed = winPolicySchema.parse(policy);
  return prisma.$transaction(async tx => {
    await lockWinPolicy(tx, tenantId);
    const actor = await liveActor(tx, tenantId, inputActor);
    if (!canManage(actor)) throw new WinError("Sólo owner o superadmin puede configurar las reglas", 403);
    const previous = await readWinPolicy(tx, tenantId);
    if (expectedRevision !== previous.revision) throw new WinError("La política cambió. Recarga antes de guardar");
    const ids = [...new Set(parsed.rules.flatMap(r => r.approverUserIds))];
    if (ids.length && await tx.app_users.count({ where: { tenant_id: tenantId, active: true, user_id: { in: ids } } }) !== ids.length) throw new WinError("Los responsables deben ser usuarios activos de esta empresa", 422);
    const noticeIds = [...new Set(parsed.reviewNoticeUserIds ?? [])];
    if (noticeIds.length && await tx.app_users.count({ where: { tenant_id: tenantId, active: true, role: "owner", user_id: { in: noticeIds } } }) !== noticeIds.length) throw new WinError("Los destinatarios de revisión interna deben ser owners activos de esta empresa", 422);
    const revision = previous.revision + 1;
    await tx.$executeRaw`INSERT INTO win_policies(tenant_id,revision,policy,updated_by) VALUES(${tenantId},${revision},${JSON.stringify(parsed)}::jsonb,${actor.userId})
      ON CONFLICT(tenant_id) DO UPDATE SET revision=EXCLUDED.revision,policy=EXCLUDED.policy,updated_by=EXCLUDED.updated_by,updated_at=now()`;
    await tx.$executeRaw`INSERT INTO win_policy_events(event_id,tenant_id,revision,policy,changed_by) VALUES(${randomUUID()},${tenantId},${revision},${JSON.stringify(parsed)}::jsonb,${actor.userId})`;
    return { ...parsed, revision };
  });
}
export type ApprovalNotice = {
  key: string; proposalId: string; proposalNumber: string; recipientCompany: string;
  kind: "internal" | "consolidation"; requirements: string[]; href: string;
};
// Pending work is the notification source: it survives sign-out and never approves anything.
// Each authenticated recipient gets only their own actionable requests in the active tenant.
export async function getApprovalNotices(tenantId: string, inputActor: WinActor): Promise<ApprovalNotice[]> {
  return prisma.$transaction(async tx => {
    const actor = await liveActor(tx, tenantId, inputActor);
    const policy = await readWinPolicy(tx, tenantId);
    const notices: ApprovalNotice[] = [];
    const isReviewRecipient = (!policy.reviewNoticeUserIds?.length || policy.reviewNoticeUserIds.includes(actor.userId))
      && (actor.userRole === "owner" || actor.isSuperAdmin);
    if (isReviewRecipient) {
      const rows = await tx.$queryRaw<{ proposal_id: string; proposal_number: string | null; recipient_company: string | null }[]>`
        SELECT p.proposal_id,f.proposal_number,f.recipient_company FROM proposals p
        LEFT JOIN LATERAL (SELECT proposal_number,recipient_company FROM formal_proposals f
          WHERE f.tenant_id=p.tenant_id AND f.proposal_id=p.proposal_id ORDER BY created_at DESC,proposal_doc_id LIMIT 1) f ON true
        WHERE p.tenant_id=${tenantId} AND p.status='in_review' AND p.outcome IS NULL
          AND NOT EXISTS (SELECT 1 FROM proposal_approvals a WHERE a.tenant_id=p.tenant_id AND a.proposal_id=p.proposal_id
            AND a.decision='approved' AND a.approver_role IN ('owner','superadmin'))
        ORDER BY p.created_at DESC,p.proposal_id LIMIT 100`;
      notices.push(...rows.map(row => ({ key: `internal:${row.proposal_id}`, proposalId: row.proposal_id,
        proposalNumber: row.proposal_number ?? "Propuesta por revisar", recipientCompany: row.recipient_company ?? "Cliente por confirmar",
        kind: "internal" as const, requirements: ["Autorización interna del owner"], href: `/propuestas?proposalId=${encodeURIComponent(row.proposal_id)}` })));
    }
    const cases = await tx.$queryRaw<{ proposal_id: string; snapshot: WinCase; created_by_user_id: string | null; proposal_number: string | null; recipient_company: string | null }[]>`
      SELECT c.proposal_id,c.snapshot,p.created_by_user_id,f.proposal_number,f.recipient_company FROM win_cases c
      JOIN proposals p ON p.tenant_id=c.tenant_id AND p.proposal_id=c.proposal_id
      LEFT JOIN LATERAL (SELECT proposal_number,recipient_company FROM formal_proposals f
        WHERE f.tenant_id=p.tenant_id AND f.proposal_id=p.proposal_id ORDER BY created_at DESC,proposal_doc_id LIMIT 1) f ON true
      WHERE c.tenant_id=${tenantId} AND p.status='approved' AND p.outcome IS NULL
        AND c.snapshot->>'cancelledAt' IS NULL AND c.snapshot->>'consolidatedAt' IS NULL
      ORDER BY c.snapshot->>'acceptedAt' DESC,c.proposal_id LIMIT 100`;
    for (const item of cases) {
      const rules = item.snapshot.rules.filter(rule => !item.snapshot.decisions[rule.id]
        && rule.dependsOn.every(id => isSatisfied(item.snapshot.decisions[id])) && mayApprove(rule, actor, item.created_by_user_id));
      if (!rules.length) continue;
      const doc = await document(tx, tenantId, item.proposal_id, actor);
      if (doc.fingerprint !== item.snapshot.fingerprint) continue;
      notices.push({ key: `consolidation:${item.proposal_id}`, proposalId: item.proposal_id, proposalNumber: item.proposal_number ?? "Propuesta aceptada",
        recipientCompany: item.recipient_company ?? "Cliente por confirmar", kind: "consolidation", requirements: rules.map(r => r.label), href: `/autorizaciones/${encodeURIComponent(item.proposal_id)}` });
    }
    return notices;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function actOnWin(tenantId: string, proposalId: string, inputActor: WinActor, input: WinAction): Promise<WinView> {
  return prisma.$transaction(async tx => {
    // Same lock order as the legacy outcome writer. No external side effects in this transaction.
    await lockWinPolicy(tx, tenantId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`business-win:${tenantId}`}, 0))::text`;
    await tx.$queryRaw`SELECT proposal_id FROM proposals WHERE tenant_id=${tenantId} AND proposal_id=${proposalId} FOR UPDATE`;
    const actor = await liveActor(tx, tenantId, inputActor);
    const doc = await document(tx, tenantId, proposalId, actor);
    const policy = await readWinPolicy(tx, tenantId);
    let current = await readCase(tx, tenantId, proposalId);
    let view = project(tenantId, proposalId, policy, current, doc, actor);
    if (input.expectedRevision !== (current?.revision ?? 0)) throw new WinError("El circuito cambió. Recarga antes de continuar");
    const now = new Date();
    if (input.action === "accept") {
      if (!view.canRecordAcceptance) throw new WinError("La propuesta debe estar autorizada, sin desenlace y sin un circuito vigente");
      if (input.expectedPolicyRevision !== policy.revision) throw new WinError("La política cambió. Recarga antes de registrar la aceptación");
      const opportunity = doc.proposal.opportunity_id ? await tx.opportunities.findFirst({ where: { tenant_id: tenantId, opportunity_id: doc.proposal.opportunity_id }, select: { created_at: true } }) : null;
      const start = earliestCommercialStart(doc.proposal.created_at, opportunity?.created_at)!;
      if (!isValidCloseDate(input.acceptedOn, start, now, false)) throw new WinError("La aceptación debe estar entre el alta comercial y hoy", 422);
      if (await hasAnotherBusinessWin(tx, tenantId, doc.proposal)) throw new WinError("Este negocio ya tiene una propuesta ganada");
      if (policy.rules.some(r => r.minimumAmount !== null) && (doc.amount === null || !Number.isFinite(doc.amount))) throw new WinError("El importe integrado no está disponible para evaluar los umbrales");
      let rules;
      try { rules = applicableRules(policy, doc.amount ?? 0, doc.currency); } catch (e) { throw new WinError((e as Error).message, 422); }
      current = { revision: (current?.revision ?? 0) + 1, policyRevision: policy.revision, rules, fingerprint: doc.fingerprint,
        acceptedOn: input.acceptedOn, acceptedAt: now.toISOString(), acceptedBy: actor.userId, acceptanceEvidence: input.evidence,
        decisions: {}, consolidatedAt: null, cancelledAt: null };
    } else {
      if (!current) throw new WinError("Registra primero la aceptación");
      if (input.action === "cancel") {
        if (!view.canCancel) throw new WinError("No puedes retirar este circuito", 403);
        current = { ...current, cancelledAt: now.toISOString(), revision: current.revision + 1 };
      } else {
        if (!["pending", "blocked"].includes(view.state)) throw new WinError("El documento cambió o el circuito ya terminó. Revisa y registra de nuevo la aceptación");
        if (input.action === "decide") {
          const rule = view.requirements.find(r => r.id === input.ruleId);
          if (!rule || !(input.decision === "waived" ? rule.canWaive : rule.canDecide)) throw new WinError("No eres responsable autorizado de este requisito", 403);
          if (rule.waitingFor.length) throw new WinError("Completa primero las autorizaciones previas");
          if ((rule.evidenceRequired || input.decision !== "approved") && input.evidence.length < (input.decision === "waived" ? 10 : 3)) throw new WinError("Registra la evidencia o el motivo de la decisión", 422);
          const decisions = { ...current.decisions, [rule.id]: { decision: input.decision, actorId: actor.userId, actorRole: actor.userRole, evidence: input.evidence, recordedAt: now.toISOString() } };
          // A revised prerequisite invalidates every downstream decision transitively.
          const invalid = new Set([rule.id]);
          for (let i = 0; i < current.rules.length; i++) for (const dependent of current.rules) {
            if (dependent.id !== rule.id && dependent.dependsOn.some(id => invalid.has(id))) { invalid.add(dependent.id); delete decisions[dependent.id]; }
          }
          current = { ...current, decisions, revision: current.revision + 1 };
        } else {
          if (!view.canConsolidate) throw new WinError("Faltan autorizaciones obligatorias o existe un rechazo");
          current = { ...current, revision: current.revision + 1 };
        }
      }
    }
    // Minimal policy consolidates immediately; a multi-step circuit needs an explicit final action.
    if (input.action === "consolidate" || (input.action === "accept" && current.rules.length === 0)) {
      if (await hasAnotherBusinessWin(tx, tenantId, doc.proposal)) throw new WinError("Este negocio ya tiene una propuesta ganada");
      const consolidatedAt = now.toISOString();
      const outcomeAt = current.rules.length === 0 ? closeDateInstant(current.acceptedOn) : closeDateInstant(mexicoCalendarDate(now));
      await tx.proposals.update({ where: { proposal_id: proposalId }, data: { outcome: "won", outcome_at: outcomeAt } });
      await audit(tx, tenantId, proposalId, actor.userId, "outcome_changed", { fromOutcome: doc.proposal.outcome, toOutcome: "won", outcomeAt: outcomeAt.toISOString(),
        acceptedOn: current.acceptedOn, consolidatedAt, policyRevision: current.policyRevision, datePrecision: "day", recordedAt: consolidatedAt });
      current = { ...current, consolidatedAt };
      doc.proposal.outcome = "won";
    }
    await saveCase(tx, tenantId, proposalId, current, actor.userId, input.action);
    view = project(tenantId, proposalId, policy, current, doc, actor);
    return withPeople(tx, tenantId, view);
  });
}
