export const RECORDIA_MCP_PREMIUM = "recordia_mcp_premium";
// Pilot boundary verified against the tenant directory. It is not configurable by a caller.
export const RECORDIA_PILOT_TENANT_ID = "389b6cc1-2f8d-4fe4-bc3d-f50f92df3157";
export const RECORDIA_PILOT_TENANT_SLUG = "sys";
export class RecordiaError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export type RecordiaActor = { tenantId: string; actorId: string };
export type RecordiaTimelineEntry = {
  title: string;
  folio?: string;
  detail?: string;
  pdf?: { revision: string; archived: boolean };
};
export type RecordiaMemory = {
  id: string;
  aup_id: string;
  memory_type: string;
  title: string;
  description: string | null;
  context: Record<string, unknown>;
  evidence_ids: string[];
  event_id: string | null;
  decision_id: string | null;
  source_connector: "cotiza";
  recorded_at_utc: string | null;
  content_kind: "persistent_snapshot";
  epistemic_status: "observed_fact" | "recorded_claim" | "decision";
  integrity_status: "hash_verified";
  timeline?: RecordiaTimelineEntry;
  preserved_snapshot?: { canonical_text: string; content_hash: string; verification_scope: "stored_envelope_and_direct_predecessor" };
  source: { kind: string; id: string; href: string | null };
};
export type RecordiaEvidence = {
  id: string;
  source_connector: "cotiza";
  source_id: string;
  source_kind: string;
  recorded_at_utc: string | null;
  content_hash: string;
  hash_algorithm: "sha256";
  previous_event_id: string | null;
  previous_hash: string;
  integrity_status: "hash_verified";
  verification_scope: "stored_envelope_and_direct_predecessor";
  canonical_text: string;
};
export type RecordiaPage = {
  items: RecordiaMemory[];
  next_offset: number | null;
  next_cursor?: string | null;
  source_truncated: boolean;
  captured_at_utc: string;
  premium: true;
  persistent?: true;
};
