import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { LoomError, type LoomLink, type LoomSnapshot, type LoomTarget } from "./domain";
import type { LoomFollowupClaims } from "./followup";
import { snapshotHash } from "./preview";
import { assertLoomTarget } from "./store";

type Row = { link_id: string; revision: number; snapshot: LoomSnapshot };
export async function findLoomLink(target: LoomTarget, id: string): Promise<LoomLink | null> {
  const rows = await prisma.$queryRaw<Row[]>`SELECT link_id,revision,snapshot FROM loom_recording_links
    WHERE link_id=${id} AND tenant_id=${target.tenantId} AND actor_id=${target.actorId} AND connection_key=${target.connectionKey}
      AND client_id=${target.clientId} AND opportunity_id IS NOT DISTINCT FROM ${target.opportunityId}`;
  const row = rows[0]; return row ? { linkId: row.link_id, revision: row.revision, snapshot: row.snapshot } : null;
}
export async function saveLoomFollowup(target: LoomTarget, draft: LoomFollowupClaims) {
  return prisma.$transaction(async tx => {
    await assertLoomTarget(tx, target);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"loom-followup:" + draft.draftId},0))::text`;
    const receipts = await tx.$queryRaw<{ kind: "note" | "task"; result_id: string }[]>`SELECT kind,result_id FROM loom_followup_receipts
      WHERE draft_id=${draft.draftId} AND tenant_id=${target.tenantId} AND actor_id=${target.actorId} FOR UPDATE`;
    if (receipts[0]) return { kind: receipts[0].kind, resultId: receipts[0].result_id, unchanged: true };
    const rows = await tx.$queryRaw<Row[]>`SELECT link_id,revision,snapshot FROM loom_recording_links
      WHERE link_id=${draft.linkId} AND tenant_id=${target.tenantId} AND actor_id=${target.actorId} AND connection_key=${target.connectionKey}
        AND client_id=${target.clientId} AND opportunity_id IS NOT DISTINCT FROM ${target.opportunityId} FOR SHARE`;
    const row = rows[0], followup = draft.followup;
    if (!row || row.revision !== draft.revision || snapshotHash(row.snapshot) !== draft.sourceHash
      || row.snapshot.transcriptStatus !== "ready" || !row.snapshot.transcript?.includes(followup.excerpt)) {
      throw new LoomError("La copia de origen cambió. Revisa el seguimiento de nuevo", 409);
    }
    const resultId = randomUUID();
    const text = followup.description + "\n\nFuente Loom: " + row.snapshot.url + "\nPasaje: " + followup.excerpt
      + "\nCopia consultada: " + row.snapshot.observedAt + " · revisión " + row.revision;
    if (followup.kind === "note") {
      await tx.$executeRaw`INSERT INTO interaction_logs(interaction_id,tenant_id,client_id,opportunity_id,note,created_by_user_id,created_at)
        VALUES (${resultId},${target.tenantId},${target.clientId},${target.opportunityId},${text},${target.actorId},now())`;
    } else {
      await tx.$executeRaw`INSERT INTO tasks(task_id,tenant_id,client_id,opportunity_id,description,due_date,completed_at,created_by_user_id,created_at)
        VALUES (${resultId},${target.tenantId},${target.clientId},${target.opportunityId},${text},${followup.dueDate}::date,NULL,${target.actorId},now())`;
    }
    await tx.$executeRaw`INSERT INTO loom_followup_receipts(draft_id,tenant_id,actor_id,link_id,revision,kind,result_id,source_excerpt,description,due_date)
      VALUES (${draft.draftId},${target.tenantId},${target.actorId},${draft.linkId},${draft.revision},${followup.kind},${resultId},
        ${followup.excerpt},${followup.description},${followup.dueDate}::date)`;
    return { kind: followup.kind, resultId, unchanged: false };
  }, { timeout: 10_000, maxWait: 3000 });
}
