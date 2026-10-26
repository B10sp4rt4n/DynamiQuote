import { describe, expect, it } from "vitest";
import { buildCommercialAct, commercialPayloadHash, verifyCommercialPayload, type CommercialActInput } from "./commercial-act";

const input: CommercialActInput = {
  eventId: "evt-1", tenantId: "tenant-a", proposalId: "proposal-a", opportunityId: "opp-a",
  actorUserId: "seller-a", actorRole: "user", action: "outcome_set", canSeeAll: false,
  before: { status: "approved", outcome: null, outcomeAt: null },
  after: { status: "approved", outcome: "won", outcomeAt: "2026-08-20T06:00:00.000Z" },
  selectedCloseDate: "2026-08-20", recordedAt: "2026-10-22T18:00:00.000Z", previous: null,
};

describe("commercial act contract", () => {
  it("separates the action time from a declared historical commercial date", () => {
    const act = buildCommercialAct(input);
    expect(act).toMatchObject({ contract_version: "1.0", sequence: 1, tenant_id: "tenant-a",
      occurred_at_utc: input.recordedAt, recorded_at_utc: input.recordedAt,
      subject: { entity_type: "proposal", entity_id: "proposal-a" },
      commercial_effective_time: { value: input.after.outcomeAt, selected_date: "2026-08-20", precision: "day", basis: "user_declared" },
      support_scope: "application_state_transition_only", evidence_refs: [],
      memory: { status: "local_only", external_recordia_ref: null, legacy_refs: [], custody_status: "not_requested" },
    });
    expect(act.source_refs).toEqual(["cotiza:tenant-a:proposal:proposal-a", "cotiza:tenant-a:opportunity:opp-a"]);
  });

  it("links corrections and revocations without claiming a legacy digest", () => {
    const previous = { eventId: "legacy-1", contentHash: null, sequence: 0 };
    expect(buildCommercialAct({ ...input, action: "close_date_corrected", previous }).relations)
      .toEqual([{ predicate: "corrects", target_id: "legacy-1" }]);
    const reopened = buildCommercialAct({ ...input, action: "outcome_cleared", previous,
      after: { status: "draft", outcome: null, outcomeAt: null }, selectedCloseDate: null });
    expect(reopened.relations).toEqual([{ predicate: "revokes", target_id: "legacy-1" }]);
    expect(reopened.commercial_effective_time).toMatchObject({ value: null, precision: "unknown", basis: "not_assigned" });
    expect(reopened.previous_content_hash_sha256).toBeNull();
  });

  it("hashes the exact UI fields and contract regardless of object-key order", () => {
    const payload = { toOutcome: "won", commercialAct: buildCommercialAct(input) };
    const hash = commercialPayloadHash(payload);
    expect(verifyCommercialPayload(payload, hash)).toBe("hash_verified");
    expect(commercialPayloadHash({ commercialAct: payload.commercialAct, toOutcome: "won" })).toBe(hash);
    expect(verifyCommercialPayload({ ...payload, toOutcome: "lost" }, hash)).toBe("hash_mismatch");
    expect(verifyCommercialPayload({ toOutcome: "won" }, hash)).toBe("hash_mismatch");
    expect(verifyCommercialPayload({ ...payload, commercialAct: { ...payload.commercialAct, tenant_id: "tenant-b" } }, hash)).toBe("hash_mismatch");
    expect(verifyCommercialPayload({ actorUserId: "legacy" }, "old-random-uuid")).toBe("legacy_unverified");
  });
});
