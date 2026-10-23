import { createHash } from "node:crypto";

export const COMMERCIAL_ACT_VERSION = "1.0";
export const COMMERCIAL_HASH_PREFIX = "aup1:sha256:";
export type CommercialState = { status: string | null; outcome: string | null; outcomeAt: string | null };
export type CommercialActInput = {
  eventId: string;
  tenantId: string;
  proposalId: string;
  opportunityId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  action: "outcome_set" | "close_date_corrected" | "outcome_cleared";
  before: CommercialState;
  after: CommercialState;
  recordedAt: string;
  selectedCloseDate: string | null;
  canSeeAll: boolean | null;
  previous: { eventId: string; contentHash: string | null; sequence: number } | null;
};

// Canonical JSON for the exact stored payload, including the legacy fields
// consumed by the UI. A digest detects content changes; it is not a signature,
// an immutable ledger or proof of receipt by Recordia/HotVault.
export function canonicalCommercialJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCommercialJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const fields = value as Record<string, unknown>;
    return `{${Object.keys(fields).sort().filter(key => fields[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalCommercialJson(fields[key])}`).join(",")}}`;
  }
  throw new Error("El acto comercial contiene un valor no serializable");
}

export function commercialPayloadHash(payload: unknown): string {
  return COMMERCIAL_HASH_PREFIX + createHash("sha256").update(canonicalCommercialJson(payload), "utf8").digest("hex");
}

export function buildCommercialAct(input: CommercialActInput) {
  const proposalRef = `cotiza:${input.tenantId}:proposal:${input.proposalId}`;
  const opportunityRef = input.opportunityId ? `cotiza:${input.tenantId}:opportunity:${input.opportunityId}` : null;
  const rule = input.action === "outcome_cleared" ? "cotiza.proposal-workflow/v1" : "cotiza.commercial-outcome/v1";
  const relation = input.action === "close_date_corrected" ? "corrects"
    : input.action === "outcome_cleared" ? "revokes" : input.before.outcome ? "supersedes" : "follows";
  return {
    recordia_version: "1.0",
    contract_version: COMMERCIAL_ACT_VERSION,
    event_id: input.eventId,
    sequence: (input.previous?.sequence ?? 0) + 1,
    tenant_id: input.tenantId,
    case_id: opportunityRef ?? proposalRef,
    subject: { entity_type: "proposal", entity_id: input.proposalId },
    opportunity_id: input.opportunityId,
    action_or_state: `commercial.${input.action}`,
    // The action is observed now. A selected historical close is separately
    // attributed to the user; it is never represented as an observed sale.
    occurred_at_utc: input.recordedAt,
    recorded_at_utc: input.recordedAt,
    actors: [{ actor_id: input.actorUserId, role: input.actorRole,
      identity_status: input.actorUserId ? "declared" : "unknown" }],
    epistemic_class: "decision",
    support_status: "supported",
    support_scope: "application_state_transition_only",
    state_before: input.before,
    state_after: input.after,
    commercial_effective_time: {
      value: input.after.outcomeAt,
      selected_date: input.selectedCloseDate,
      precision: input.selectedCloseDate ? "day" : input.after.outcomeAt ? "instant" : "unknown",
      basis: input.selectedCloseDate ? "user_declared" : input.after.outcomeAt ? "application_recorded" : "not_assigned",
    },
    source_refs: [proposalRef, ...(opportunityRef ? [opportunityRef] : [])],
    evidence_refs: [],
    relations: input.previous ? [{ predicate: relation, target_id: input.previous.eventId }] : [],
    previous_content_hash_sha256: input.previous?.contentHash ?? null,
    policy_or_rule_refs: [rule],
    rule_snapshot: { rule, allowed_decision_statuses: ["sent", "approved"], can_see_all: input.canSeeAll,
      resulting_status: input.after.status },
    memory: { status: "local_only", external_recordia_ref: null, legacy_refs: [], custody_status: "not_requested" },
  };
}

export type CommercialIntegrity = "hash_verified" | "hash_mismatch" | "legacy_unverified";
export function verifyCommercialPayload(payload: Record<string, unknown>, storedHash: string): CommercialIntegrity {
  // The storage marker prevents a removed contract from being downgraded to
  // legacy/unverified. Unmarked historical hashes keep their original status.
  if (!Object.hasOwn(payload, "commercialAct")) return storedHash.startsWith(COMMERCIAL_HASH_PREFIX) ? "hash_mismatch" : "legacy_unverified";
  const act = payload.commercialAct;
  if (!act || typeof act !== "object" || Array.isArray(act)
    || (act as Record<string, unknown>).contract_version !== COMMERCIAL_ACT_VERSION) return "hash_mismatch";
  return storedHash.startsWith(COMMERCIAL_HASH_PREFIX)
    && /^[a-f0-9]{64}$/.test(storedHash.slice(COMMERCIAL_HASH_PREFIX.length))
    && commercialPayloadHash(payload) === storedHash ? "hash_verified" : "hash_mismatch";
}
