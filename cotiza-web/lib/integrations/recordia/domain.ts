export const RECORDIA_MCP_PREMIUM = "recordia_mcp_premium";
// Pilot boundary verified against the tenant directory. It is not configurable by a caller.
export const RECORDIA_PILOT_TENANT_ID = "389b6cc1-2f8d-4fe4-bc3d-f50f92df3157";
export const RECORDIA_PILOT_TENANT_SLUG = "sys";
export class RecordiaError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export type RecordiaActor = { tenantId: string; actorId: string };
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
  content_kind: "source_projection";
  epistemic_status: "observed_fact" | "recorded_claim" | "decision";
  integrity_status: "not_verified";
  source: { kind: string; id: string; href: string | null };
};
export type RecordiaEvidence = {
  id: string;
  source_connector: "cotiza";
  source_id: string;
  source_kind: string;
  recorded_at_utc: string | null;
  projection_hash: string;
  projection_hash_algorithm: "sha256";
  integrity_status: "not_verified";
};
export type RecordiaPage = {
  items: RecordiaMemory[];
  next_offset: number | null;
  source_truncated: boolean;
  captured_at_utc: string;
  premium: true;
};
