import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { mexicoCalendarDate } from "@/lib/domain/commercial-close-date";
import { validateProcurementBasis, type ProcurementBasis, type ProcurementDraft } from "@/lib/domain/procurement-draft";
type Tx = Prisma.TransactionClient;
type Row = { draft_id: string; tenant_id: string; proposal_id: string; closure_key: string; source_hash: string; folio: string;
  revision: number; state: ProcurementDraft["state"]; review_reason: string | null; basis: ProcurementBasis;
  notes: string; needed_on: Date | null; created_at: Date; created_by: string };
export const procurementClosureKey = (basis: Pick<ProcurementBasis,"tenantId"|"proposalId"|"acceptedAt"|"consolidatedAt">) =>
  createHash("sha256").update(JSON.stringify([basis.tenantId,basis.proposalId,basis.acceptedAt,basis.consolidatedAt])).digest("hex");
function project(row: Row): ProcurementDraft {
  return { id: row.draft_id, tenantId: row.tenant_id, proposalId: row.proposal_id, closureKey: row.closure_key, sourceHash: row.source_hash,
    folio: row.folio, revision: row.revision, state: row.state, reason: row.review_reason, basis: row.basis, notes: row.notes,
    neededOn: row.needed_on?.toISOString().slice(0,10) ?? null, createdAt: row.created_at.toISOString(), createdBy: row.created_by };
}
export async function procurementTablesReady(tx: Tx) {
  const rows = await tx.$queryRaw<{ ready: boolean }[]>`SELECT (to_regclass('public.procurement_drafts') IS NOT NULL
    AND to_regclass('public.procurement_draft_events') IS NOT NULL AND to_regclass('public.procurement_draft_counters') IS NOT NULL) AS ready`;
  return rows[0]?.ready === true;
}
async function context(tx: Tx, tenantId: string) { await tx.$queryRaw`SELECT set_config('app.tenant_id',${tenantId},true)`; }
export async function readProcurementDrafts(tx: Tx, tenantId: string, proposalId: string) {
  await context(tx,tenantId);
  return (await tx.$queryRaw<Row[]>`SELECT * FROM procurement_drafts WHERE tenant_id=${tenantId} AND proposal_id=${proposalId}
    ORDER BY created_at DESC,draft_id DESC`).map(project);
}
async function event(tx: Tx, draft: ProcurementDraft, actor: string, type: "prepared"|"updated"|"review_required", payload: object) {
  await tx.$executeRaw`INSERT INTO procurement_draft_events(event_id,tenant_id,draft_id,revision,event_type,actor_id,payload)
    VALUES(${randomUUID()},${draft.tenantId},${draft.id},${draft.revision},${type},${actor},${JSON.stringify(payload)}::jsonb)`;
}
/** Caller holds policy → business win → proposal row locks and has checked the live actor/source. */
export async function prepareProcurementInTransaction(tx: Tx, value: ProcurementBasis, actorId: string) {
  const basis = validateProcurementBasis(value), key = procurementClosureKey(basis);
  await context(tx,basis.tenantId);
  const existing = (await readProcurementDrafts(tx,basis.tenantId,basis.proposalId)).find(d => d.closureKey===key);
  if (existing) return { draft: existing, replayed: true };
  const year = Number(mexicoCalendarDate(new Date()).slice(0,4));
  const count = await tx.$queryRaw<{ value: number }[]>`INSERT INTO procurement_draft_counters(tenant_id,year,value) VALUES(${basis.tenantId},${year},1)
    ON CONFLICT(tenant_id,year) DO UPDATE SET value=procurement_draft_counters.value+1 RETURNING value`;
  const folio = `REQ-${year}-${String(count[0].value).padStart(4,"0")}`;
  const sourceHash = createHash("sha256").update(JSON.stringify(basis)).digest("hex");
  const rows = await tx.$queryRaw<Row[]>`INSERT INTO procurement_drafts(draft_id,tenant_id,proposal_id,closure_key,source_hash,folio,basis,created_by,updated_by)
    VALUES(${randomUUID()},${basis.tenantId},${basis.proposalId},${key},${sourceHash},${folio},${JSON.stringify(basis)}::jsonb,${actorId},${actorId}) RETURNING *`;
  const draft = project(rows[0]); await event(tx,draft,actorId,"prepared",{ sourceHash, closureKey:key, winRevision:basis.winRevision, policyRevision:basis.policyRevision });
  return { draft, replayed: false };
}
export async function updateProcurementInTransaction(tx: Tx, draft: ProcurementDraft, actorId: string, notes: string, neededOn: string|null) {
  await context(tx,draft.tenantId);
  const rows = await tx.$queryRaw<Row[]>`UPDATE procurement_drafts SET notes=${notes},needed_on=${neededOn}::date,revision=revision+1,
    updated_by=${actorId},updated_at=now() WHERE tenant_id=${draft.tenantId} AND draft_id=${draft.id} AND revision=${draft.revision} AND state='draft' RETURNING *`;
  if (!rows[0]) return null;
  const updated = project(rows[0]); await event(tx,updated,actorId,"updated",{ before:{notes:draft.notes,neededOn:draft.neededOn},after:{notes,neededOn} });
  return updated;
}
export async function invalidateProcurementInTransaction(tx: Tx, tenantId: string, proposalId: string, actorId: string, reason: string) {
  if (!await procurementTablesReady(tx)) return;
  await context(tx,tenantId);
  const rows = await tx.$queryRaw<Row[]>`UPDATE procurement_drafts SET state='review_required',review_reason=${reason},revision=revision+1,
    updated_by=${actorId},updated_at=now() WHERE tenant_id=${tenantId} AND proposal_id=${proposalId} AND state='draft' RETURNING *`;
  for (const row of rows) { const draft=project(row); await event(tx,draft,actorId,"review_required",{reason}); }
}
