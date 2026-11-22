import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveBusiness } from "@/lib/db/opportunity-workspace";
import { revalidateRecordiaActor } from "./access";
import { RECORDIA_PILOT_TENANT_ID, RecordiaError, type RecordiaActor, type RecordiaEvidence, type RecordiaMemory } from "./domain";
import { describeRecordiaEvent } from "./timeline";

export type MemoryRow = {
  event_id: string; event_number: string; source_table: string; source_id: string; source_version: number;
  event_type: string; case_ids: string[]; associated_case_ids?: string[]; recorded_at_utc: string; source_timestamp_raw: string | null;
  actor_id: string | null; actor_identity_status: "declared" | "unknown"; recorder_db_role: string;
  before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null;
  previous_event_id: string | null; previous_hash: string; parent_hash: string | null;
  content_hash: string; canonical_text: string;
  proposal_folio?: string | null;
  archived_document_revision?: string | null;
};
const labels: Record<string, string> = { opportunities: "Oportunidad", quotes: "Cotización", proposals: "Propuesta", interaction_logs: "Nota comercial",
  proposal_audit_events: "Evento de propuesta", proposal_approvals: "Aprobación", quote_lines: "Partida de cotización",
  formal_proposals: "Documento de propuesta", proposal_items: "Partida de propuesta", tasks: "Tarea" };
const actions: Record<string, string> = { "baseline.observed": "Estado inicial conservado", "baseline.reobserved": "Estado observado después de un intervalo sin captura", "source.created": "Registro creado", "source.attached":"Registro incorporado a la empresa",
  "source.updated": "Nueva versión conservada", "source.deleted": "Eliminación registrada", "source.detached": "Salida de la empresa registrada" };

/** Verify the EXACT stored UTF-8 envelope and its direct predecessor, not original files or HotVault custody. */
export function projectPersistentMemory(opportunityId: string, row: MemoryRow, includeSnapshot = false) {
  if (createHash("sha256").update(row.canonical_text, "utf8").digest("hex") !== row.content_hash
    || row.previous_hash !== (row.source_version === 1 ? "0".repeat(64) : row.parent_hash)) {
    throw new RecordiaError("La memoria no pasó la comprobación de integridad", 503);
  }
  const envelope = JSON.parse(row.canonical_text) as Record<string, unknown>;
  if (envelope.event_id !== row.event_id || envelope.source_id !== row.source_id || envelope.source_table !== row.source_table
    || envelope.source_version !== row.source_version || envelope.tenant_id !== RECORDIA_PILOT_TENANT_ID
    || envelope.recorded_at_utc !== row.recorded_at_utc || envelope.previous_hash !== row.previous_hash
    || envelope.actor_id !== row.actor_id || envelope.actor_identity_status !== row.actor_identity_status
    || envelope.event_type !== row.event_type || envelope.source_timestamp_raw !== row.source_timestamp_raw
    || envelope.recorder_db_role !== row.recorder_db_role
    || envelope.previous_event_id !== row.previous_event_id || !isDeepStrictEqual(envelope.case_ids,row.case_ids)
    || !isDeepStrictEqual(envelope.before_data,row.before_data) || !isDeepStrictEqual(envelope.after_data,row.after_data)
    || !(row.case_ids.includes(opportunityId)||row.associated_case_ids?.includes(opportunityId))) throw new RecordiaError("Referencia de memoria inconsistente", 503);
  const image = row.after_data ?? row.before_data ?? {};
  const note = typeof image.note === "string" ? image.note : null;
  const timeline = describeRecordiaEvent(row, image);
  const memory: RecordiaMemory = {
    id: row.event_id, aup_id: opportunityId, memory_type: "context_snapshot", title: `${labels[row.source_table] ?? "Registro"} · ${actions[row.event_type] ?? row.event_type}`,
    description: note?.slice(0, 4000) ?? null,
    context: { version: row.source_version, event_type: row.event_type, source_timestamp_raw: row.source_timestamp_raw,
      actor_id: row.actor_id, actor_identity_status: row.actor_identity_status, folio: image.opportunity_number ?? image.quote_group_id ?? image.proposal_number ?? null,
      preserved_before_case_link: !row.case_ids.includes(opportunityId),
      decision: image.decision ?? null, text_truncated: Boolean(note && note.length > 4000),
      previous_event_id: row.previous_event_id, previous_hash: row.previous_hash, content_hash: row.content_hash },
    evidence_ids: [`recordia:${row.event_id}`], event_id: row.event_id,
    decision_id: row.source_table === "proposal_approvals" ? row.source_id : null,
    source_connector: "cotiza", recorded_at_utc: row.recorded_at_utc, content_kind: "persistent_snapshot",
    epistemic_status: row.source_table === "interaction_logs" ? "recorded_claim" : row.source_table === "proposal_approvals" ? "decision" : "observed_fact",
    integrity_status: "hash_verified", source: { kind: row.source_table, id: row.source_id, href: null },
    ...(timeline ? { timeline } : {}),
    ...(includeSnapshot ? { preserved_snapshot: { canonical_text: row.canonical_text, content_hash: row.content_hash,
      verification_scope: "stored_envelope_and_direct_predecessor" as const } } : {}),
  };
  const evidence: RecordiaEvidence = { id: `recordia:${row.event_id}`, source_connector: "cotiza", source_id: row.source_id,
    source_kind: row.source_table, recorded_at_utc: row.recorded_at_utc,
    content_hash: row.content_hash, hash_algorithm: "sha256", previous_event_id: row.previous_event_id,
    previous_hash: row.previous_hash, integrity_status: "hash_verified", verification_scope: "stored_envelope_and_direct_predecessor",
    canonical_text: row.canonical_text };
  return { memory, evidence };
}

async function dossierIds(actor: RecordiaActor, id: string) {
  const business = await resolveBusiness(actor.tenantId, id, { userId: actor.actorId, canSeeAll: true });
  return business?.opportunity.opportunityId === id ? business.ids : [id];
}
export async function readRecordiaDossier(actor: RecordiaActor, opportunityId: string,
  options: { limit?: number; offset?: number; beforeEventNumber?: string; eventId?: string } = {}) {
  await revalidateRecordiaActor(actor);
  const ids = await dossierIds(actor, opportunityId);
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  if (options.eventId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(options.eventId)) {
    throw new RecordiaError("Registro no encontrado", 404);
  }
  const rows = await prisma.$queryRaw<MemoryRow[]>(Prisma.sql`
    WITH related AS (
      SELECT source_table,source_id,array_agg(DISTINCT c.case_id) AS associated_case_ids
      FROM recordia_memory_events CROSS JOIN LATERAL unnest(case_ids) c(case_id)
      WHERE tenant_id=${actor.tenantId} AND c.case_id IN (${Prisma.join(ids)}) GROUP BY source_table,source_id
    ), page AS (
      SELECT e.*, related.associated_case_ids FROM recordia_memory_events e JOIN related USING(source_table,source_id)
      WHERE e.tenant_id=${actor.tenantId}
        AND (${options.eventId ?? null}::uuid IS NULL OR e.event_id=${options.eventId ?? null}::uuid)
        AND (${options.beforeEventNumber ?? null}::bigint IS NULL OR e.event_number<${options.beforeEventNumber ?? null}::bigint)
      ORDER BY e.event_number DESC LIMIT ${options.eventId ? 1 : limit + 1} OFFSET ${options.offset ?? 0}
    ) SELECT e.*, e.event_id::text AS event_id, e.event_number::text AS event_number,
      e.previous_event_id::text AS previous_event_id,
      e.canonical_text::jsonb->>'recorded_at_utc' AS recorded_at_utc, parent.content_hash AS parent_hash,
      document.folio AS proposal_folio, document.revision AS archived_document_revision
    FROM page e LEFT JOIN recordia_memory_events parent
      ON parent.event_id=e.previous_event_id AND parent.tenant_id=e.tenant_id
      AND parent.source_table=e.source_table AND parent.source_id=e.source_id AND parent.source_version=e.source_version-1
    LEFT JOIN LATERAL (
      SELECT archive.after_data->>'proposal_number' AS folio,
        CASE WHEN archive.after_data IS NOT NULL THEN archive.event_id::text END AS revision
      FROM recordia_memory_events archive
      WHERE e.source_table IN ('proposal_audit_events','proposal_approvals')
        AND archive.tenant_id=e.tenant_id AND archive.source_table='formal_proposals'
        AND COALESCE(archive.after_data,archive.before_data)->>'proposal_id'=COALESCE(e.after_data,e.before_data)->>'proposal_id'
        AND archive.event_number<e.event_number
      ORDER BY archive.event_number DESC LIMIT 1
    ) document ON true
    ORDER BY e.event_number DESC`);
  if (!rows.length && (options.eventId || !options.offset && !options.beforeEventNumber)) {
    throw new RecordiaError("Expediente o registro no encontrado", 404);
  }
  // Each event retains its own historical case references, including a deleted live opportunity.
  const projected = rows.slice(0, limit).map(row => projectPersistentMemory(
    (row.associated_case_ids??row.case_ids).includes(opportunityId) ? opportunityId : (row.associated_case_ids??row.case_ids).find(id => ids.includes(id))!, row, Boolean(options.eventId)));
  await revalidateRecordiaActor(actor);
  return { projected, next_offset: rows.length > limit ? (options.offset ?? 0) + limit : null,
    next_cursor: rows.length > limit ? rows[limit - 1].event_number : null,
    source_truncated: false, captured_at_utc: new Date().toISOString(), persistent: true as const };
}

export async function verifyRecordiaDossier(actor: RecordiaActor, opportunityId: string) {
  await revalidateRecordiaActor(actor);
  const ids = await dossierIds(actor, opportunityId);
  const [result] = await prisma.$queryRaw<{ events: number; valid: boolean }[]>(Prisma.sql`
    WITH selected AS (
      SELECT DISTINCT source_table,source_id FROM recordia_memory_events
      WHERE tenant_id=${actor.tenantId} AND case_ids && ARRAY[${Prisma.join(ids)}]::text[]
    ), chain AS (
      SELECT e.*, row_number() OVER w AS expected_version, lag(e.content_hash) OVER w AS expected_hash,
        lag(e.event_id) OVER w AS expected_previous
      FROM recordia_memory_events e JOIN selected USING(source_table,source_id) WHERE tenant_id=${actor.tenantId}
      WINDOW w AS (PARTITION BY e.tenant_id,e.source_table,e.source_id ORDER BY e.source_version)
    ) SELECT count(*)::int AS events, COALESCE(bool_and(source_version=expected_version
      AND previous_hash=COALESCE(expected_hash,repeat('0',64)) AND previous_event_id IS NOT DISTINCT FROM expected_previous
      AND content_hash=encode(sha256(convert_to(canonical_text,'UTF8')),'hex')),false) AS valid FROM chain`);
  await revalidateRecordiaActor(actor);
  if (!result?.events) throw new RecordiaError("Expediente no encontrado",404);
  return { ...result, verification_scope: "all_stored_versions_of_dossier_sources", checked_at_utc: new Date().toISOString(),
    custody_status: "not_certified" };
}

export async function listRecordiaCases(actor: RecordiaActor) {
  await revalidateRecordiaActor(actor);
  const rows = await prisma.$queryRaw<{ id: string; title: string; folio: string; deleted: boolean; versions: number }[]>(Prisma.sql`
    SELECT DISTINCT ON (source_id) source_id AS id,
      COALESCE(after_data->>'title',before_data->>'title','Oportunidad archivada') AS title,
      COALESCE(after_data->>'opportunity_number',before_data->>'opportunity_number',source_id) AS folio,
      after_data IS NULL AS deleted, source_version AS versions
    FROM recordia_memory_events WHERE tenant_id=${actor.tenantId} AND source_table='opportunities'
    ORDER BY source_id,source_version DESC LIMIT 200`);
  await revalidateRecordiaActor(actor);
  return rows;
}
