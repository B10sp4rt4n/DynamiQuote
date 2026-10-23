import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { buildCommercialAct, COMMERCIAL_HASH_PREFIX, commercialPayloadHash, verifyCommercialPayload, type CommercialActInput } from "@/lib/domain/commercial-act";

// Called only inside the transaction holding the proposal lock. Do not catch
// failures here: an unrecorded commercial decision must roll back with its state.
export async function recordCommercialAct(tx: Prisma.TransactionClient, input: Omit<CommercialActInput, "eventId" | "previous"> & {
  eventType: "outcome_changed" | "outcome_date_changed";
  legacyPayload: Record<string, unknown>;
}): Promise<void> {
  const previousEvents = await tx.proposal_audit_events.findMany({
    where: { tenant_id: input.tenantId, proposal_id: input.proposalId,
      event_type: { in: ["outcome_changed", "outcome_date_changed"] } },
    select: { event_id: true, payload: true, event_hash: true },
    orderBy: [{ created_at: "desc" }, { event_id: "desc" }],
  });
  let previous: CommercialActInput["previous"] = previousEvents[0]
    ? { eventId: previousEvents[0].event_id, contentHash: null, sequence: 0 } : null;
  for (const event of previousEvents) {
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(event.payload ?? "{}"); } catch {
      if (event.event_hash.startsWith(COMMERCIAL_HASH_PREFIX)) throw new Error("La memoria comercial previa no supera la verificación de integridad");
      continue;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      if (event.event_hash.startsWith(COMMERCIAL_HASH_PREFIX)) throw new Error("La memoria comercial previa no supera la verificación de integridad");
      continue;
    }
    const integrity = verifyCommercialPayload(payload, event.event_hash);
    if (integrity === "hash_mismatch") throw new Error("La memoria comercial previa no supera la verificación de integridad");
    if (integrity !== "hash_verified") continue;
    const act = payload.commercialAct as Record<string, unknown>;
    const subject = act.subject as Record<string, unknown> | undefined;
    if (act.tenant_id !== input.tenantId || subject?.entity_id !== input.proposalId
      || act.event_id !== event.event_id || !Number.isSafeInteger(act.sequence) || (act.sequence as number) < 1) {
      throw new Error("La memoria comercial previa tiene un contexto inválido");
    }
    if ((act.sequence as number) > (previous?.sequence ?? 0)) {
      previous = { eventId: event.event_id, contentHash: event.event_hash.slice(COMMERCIAL_HASH_PREFIX.length), sequence: act.sequence as number };
    }
  }
  const eventId = randomUUID();
  const payload = { ...input.legacyPayload, commercialAct: buildCommercialAct({ ...input, eventId, previous }) };
  await tx.proposal_audit_events.create({ data: {
    event_id: eventId, tenant_id: input.tenantId, proposal_id: input.proposalId,
    event_type: input.eventType, event_hash: commercialPayloadHash(payload),
    payload: JSON.stringify(payload), created_at: new Date(input.recordedAt),
  } });
}
