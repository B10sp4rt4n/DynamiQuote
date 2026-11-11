import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { LOOM_CONTEXT } from "@/lib/tenant-capabilities";
import { LoomError, type LoomLink, type LoomSnapshot, type LoomTarget } from "./domain";
import { snapshotHash } from "./preview";

type Row = { link_id: string; revision: number; snapshot: LoomSnapshot; snapshot_hash: string };
const map = (row: Row): LoomLink => ({ linkId: row.link_id, revision: row.revision, snapshot: row.snapshot });
export async function listLoomLinks(target: LoomTarget): Promise<LoomLink[]> {
  const rows = await prisma.$queryRaw<Row[]>`SELECT link_id, revision, snapshot FROM loom_recording_links
    WHERE tenant_id=${target.tenantId} AND actor_id=${target.actorId} AND connection_key=${target.connectionKey}
      AND client_id=${target.clientId} AND opportunity_id IS NOT DISTINCT FROM ${target.opportunityId}
    ORDER BY imported_at DESC, link_id LIMIT 20`;
  return rows.map(map);
}
export async function getLoomRevision(target: LoomTarget, sourceId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ revision: number }[]>`SELECT revision FROM loom_recording_links
    WHERE tenant_id=${target.tenantId} AND actor_id=${target.actorId} AND connection_key=${target.connectionKey}
      AND client_id=${target.clientId} AND opportunity_id IS NOT DISTINCT FROM ${target.opportunityId} AND source_id=${sourceId}`;
  return rows[0]?.revision ?? null;
}
export async function saveLoomLink(target: LoomTarget, snapshot: LoomSnapshot, expectedRevision: number | null) {
  const hash = snapshotHash(snapshot);
  return prisma.$transaction(async tx => {
    // Recheck and lock authorization after the remote read, before committing any copy.
    const member = await tx.$queryRaw<{ user_id: string }[]>`SELECT user_id FROM app_users
      WHERE user_id=${target.actorId} AND active=true AND lower(role) IN ('superadmin','super_admin','platform_admin','root') FOR SHARE`;
    const tenant = await tx.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM tenants WHERE tenant_id=${target.tenantId} AND active=true FOR SHARE`;
    const cap = await tx.$queryRaw<{ enabled: boolean }[]>`SELECT enabled FROM tenant_capabilities
      WHERE tenant_id=${target.tenantId} AND capability_key=${LOOM_CONTEXT} AND enabled=true FOR SHARE`;
    if (!member.length || !tenant.length || !cap.length) throw new LoomError("El acceso al piloto cambió. Recarga el expediente", 403);
    const client = await tx.$queryRaw<{ client_id: string }[]>`SELECT client_id FROM clients
      WHERE tenant_id=${target.tenantId} AND client_id=${target.clientId} FOR SHARE`;
    if (!client.length) throw new LoomError("El cliente ya no está disponible", 404);
    if (target.opportunityId) {
      const opportunity = await tx.$queryRaw<{ opportunity_id: string }[]>`SELECT opportunity_id FROM opportunities
        WHERE tenant_id=${target.tenantId} AND client_id=${target.clientId} AND opportunity_id=${target.opportunityId} FOR SHARE`;
      if (!opportunity.length) throw new LoomError("La oportunidad cambió de cliente o empresa", 409);
    }
    const lock = JSON.stringify([target.tenantId, target.actorId, target.connectionKey, target.clientId, target.opportunityId, snapshot.sourceId]);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))::text`;
    const rows = await tx.$queryRaw<Row[]>`SELECT link_id, revision, snapshot, snapshot_hash FROM loom_recording_links
      WHERE tenant_id=${target.tenantId} AND actor_id=${target.actorId} AND connection_key=${target.connectionKey}
        AND client_id=${target.clientId} AND opportunity_id IS NOT DISTINCT FROM ${target.opportunityId}
        AND source_id=${snapshot.sourceId} FOR UPDATE`;
    const previous = rows[0];
    if (previous?.snapshot_hash === hash) return { link: map(previous), unchanged: true };
    if ((previous?.revision ?? null) !== expectedRevision) throw new LoomError("Otra revisión de la grabación fue guardada. Revisa de nuevo", 409);
    // An unavailable remote transcript must never erase an existing complete copy.
    if (previous?.snapshot.transcriptStatus === "ready" && snapshot.transcriptStatus !== "ready") {
      throw new LoomError("La transcripción no está disponible ahora. Se conserva la copia anterior", 409);
    }
    const id = previous?.link_id ?? randomUUID(), revision = (previous?.revision ?? 0) + 1, json = JSON.stringify(snapshot);
    if (!previous) {
      await tx.$executeRaw`INSERT INTO loom_recording_links
        (link_id,tenant_id,actor_id,connection_key,client_id,opportunity_id,source_id,snapshot,snapshot_hash,revision)
        VALUES (${id},${target.tenantId},${target.actorId},${target.connectionKey},${target.clientId},${target.opportunityId},
          ${snapshot.sourceId},${json}::jsonb,${hash},${revision})`;
    } else {
      await tx.$executeRaw`UPDATE loom_recording_links SET snapshot=${json}::jsonb,snapshot_hash=${hash},revision=${revision},imported_at=now()
        WHERE link_id=${id} AND tenant_id=${target.tenantId} AND actor_id=${target.actorId}`;
    }
    await tx.$executeRaw`INSERT INTO loom_recording_versions(link_id,revision,snapshot,snapshot_hash)
      VALUES (${id},${revision},${json}::jsonb,${hash})`;
    return { link: { linkId: id, revision, snapshot }, unchanged: false };
  }, { timeout: 10_000, maxWait: 3000 });
}
