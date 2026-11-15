import "server-only";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { gmailConfig } from "./config";
import { accountEmail, exchangeToken, type GmailToken, readMessage, searchMessages } from "./client";
import { digest, seal, unseal, snapshotHash } from "./crypto";
import { GmailError, messageView, type GmailActor, type GmailTarget, type GmailSnapshot, type GmailLink, type GmailConnectionView } from "./domain";

type Connection = { email_address: string; credentials: string | null; expires_at: Date;
  status: string; oauth_client_id: string };
const actorKey = (actor: GmailActor) => JSON.stringify([actor.tenantId, actor.actorId]);
const tokenContext = (actor: GmailActor, email: string) => `gmail:tokens:${actorKey(actor)}:${gmailConfig().clientId}:${email}`;
const sourceContext = (actor: GmailActor, email: string, messageId: string, hash: string) => `gmail:source:${actorKey(actor)}:${email}:${messageId}:${hash}`;
async function lock(tx: Prisma.TransactionClient, actor: GmailActor) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"gmail:" + actorKey(actor)},0))::text`;
}
export async function assertGmailActor(tx: Prisma.TransactionClient, actor: GmailActor) {
  if (process.env.COTIZA_GMAIL_ENABLED !== "true" || process.env.COTIZA_GMAIL_TENANT_ID !== actor.tenantId) throw new GmailError("El piloto cambió de empresa", 403);
  const users = await tx.$queryRaw<{ user_id: string }[]>`SELECT user_id FROM app_users WHERE user_id=${actor.actorId}
    AND active=true AND lower(role) IN ('superadmin','super_admin','platform_admin','root') FOR SHARE`;
  const tenants = await tx.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM tenants WHERE tenant_id=${actor.tenantId} AND active=true FOR SHARE`;
  if (!users.length || !tenants.length) throw new GmailError("El acceso cambió. Inicia sesión de nuevo", 403);
}
async function assertTarget(tx: Prisma.TransactionClient, target: GmailTarget) {
  await assertGmailActor(tx, target);
  const rows = await tx.$queryRaw<{ opportunity_id: string }[]>`SELECT opportunity_id FROM opportunities
    WHERE tenant_id=${target.tenantId} AND opportunity_id=${target.opportunityId} AND client_id=${target.clientId} FOR SHARE`;
  if (!rows.length) throw new GmailError("La oportunidad cambió de cliente o empresa", 409);
}
async function connection(tx: Prisma.TransactionClient, actor: GmailActor) {
  const rows = await tx.$queryRaw<Connection[]>`SELECT email_address,credentials,expires_at,status,oauth_client_id FROM gmail_connections
    WHERE tenant_id=${actor.tenantId} AND actor_id=${actor.actorId}`;
  return rows[0] ?? null;
}
export async function readConnection(actor: GmailActor): Promise<GmailConnectionView> {
  const rows = await prisma.$queryRaw<{ email_address: string; status: string }[]>`SELECT email_address,status FROM gmail_connections
    WHERE tenant_id=${actor.tenantId} AND actor_id=${actor.actorId}`;
  return rows[0] ? { email: rows[0].email_address, status: rows[0].status } : null;
}
export async function beginAuthorization(actor: GmailActor, state: string, browser: string) {
  await prisma.$transaction(async tx => {
    await lock(tx, actor); await assertGmailActor(tx, actor);
    await tx.$executeRaw`DELETE FROM gmail_oauth_attempts WHERE tenant_id=${actor.tenantId} AND actor_id=${actor.actorId} AND expires_at < now() - interval '1 day'`;
    const counts = await tx.$queryRaw<{ count: number }[]>`SELECT count(*)::int count FROM gmail_oauth_attempts
      WHERE tenant_id=${actor.tenantId} AND actor_id=${actor.actorId} AND created_at > now() - interval '10 minutes'`;
    if ((counts[0]?.count ?? 0) >= 5) throw new GmailError("Espera unos minutos antes de volver a conectar", 429);
    await tx.$executeRaw`UPDATE gmail_oauth_attempts SET revoked_at=now() WHERE tenant_id=${actor.tenantId} AND actor_id=${actor.actorId} AND revoked_at IS NULL`;
    await tx.$executeRaw`INSERT INTO gmail_oauth_attempts(state_hash,tenant_id,actor_id,browser_hash,expires_at)
      VALUES (${digest(state)},${actor.tenantId},${actor.actorId},${digest(browser)},now()+interval '10 minutes')`;
  });
}
export async function consumeAuthorization(actor: GmailActor, state: string, browser: string) {
  const rows = await prisma.$queryRaw<{ state_hash: string }[]>`UPDATE gmail_oauth_attempts SET consumed_at=now()
    WHERE state_hash=${digest(state)} AND tenant_id=${actor.tenantId} AND actor_id=${actor.actorId}
      AND browser_hash=${digest(browser)} AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING state_hash`;
  if (!rows.length) throw new GmailError("La autorización venció o cambió la sesión o empresa. Vuelve a conectar", 422);
}
export async function finishAuthorization(actor: GmailActor, state: string, token: GmailToken) {
  const config = gmailConfig(), email = await accountEmail(token.access_token);
  if (email !== config.email) throw new GmailError("Selecciona la cuenta de correo habilitada para este piloto", 403);
  if (!token.refresh_token) throw new GmailError("Google no entregó autorización persistente. Vuelve a conectar y acepta los permisos", 422);
  await prisma.$transaction(async tx => {
    await lock(tx, actor); await assertGmailActor(tx, actor);
    const attempts = await tx.$queryRaw<{ state_hash: string }[]>`SELECT state_hash FROM gmail_oauth_attempts
      WHERE state_hash=${digest(state)} AND tenant_id=${actor.tenantId} AND actor_id=${actor.actorId}
        AND consumed_at IS NOT NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`;
    if (!attempts.length) throw new GmailError("La conexión fue cancelada o reemplazada", 409);
    const previous = await connection(tx, actor);
    if (previous && previous.email_address !== email) throw new GmailError("El expediente conserva la conexión con su buzón original", 409);
    await tx.$executeRaw`INSERT INTO gmail_connections(tenant_id,actor_id,email_address,oauth_client_id,credentials,expires_at,status)
      VALUES (${actor.tenantId},${actor.actorId},${email},${config.clientId},${seal(JSON.stringify(token),tokenContext(actor,email))},
        ${new Date(Date.now()+token.expires_in*1000)},'connected')
      ON CONFLICT(tenant_id,actor_id) DO UPDATE SET oauth_client_id=EXCLUDED.oauth_client_id,credentials=EXCLUDED.credentials,
        expires_at=EXCLUDED.expires_at,status='connected',connected_at=now()`;
    await tx.$executeRaw`UPDATE gmail_oauth_attempts SET revoked_at=now() WHERE state_hash=${digest(state)}`;
  });
}
async function accessToken(actor: GmailActor) {
  return prisma.$transaction(async tx => {
    await lock(tx, actor); await assertGmailActor(tx, actor);
    const row = await connection(tx, actor), config = gmailConfig();
    if (!row || row.status !== "connected" || !row.credentials || row.oauth_client_id !== config.clientId || row.email_address !== config.email) {
      throw new GmailError("Conecta o vuelve a autorizar tu cuenta de Gmail", 409);
    }
    let token = JSON.parse(unseal(row.credentials, tokenContext(actor,row.email_address))) as GmailToken;
    if (row.expires_at.getTime() < Date.now()+60_000) {
      if (!token.refresh_token) throw new GmailError("Vuelve a conectar Gmail", 409);
      const refreshed = await exchangeToken({ grant_type: "refresh_token", refresh_token: token.refresh_token });
      token = { ...refreshed, refresh_token: refreshed.refresh_token ?? token.refresh_token };
      await tx.$executeRaw`UPDATE gmail_connections SET credentials=${seal(JSON.stringify(token),tokenContext(actor,row.email_address))},
        expires_at=${new Date(Date.now()+token.expires_in*1000)} WHERE tenant_id=${actor.tenantId} AND actor_id=${actor.actorId}`;
    }
    return { token: token.access_token, email: row.email_address };
  }, { timeout: 20_000, maxWait: 3000 });
}
export async function searchMailbox(actor: GmailActor, query: string, pageToken?: string) {
  const access = await accessToken(actor);
  return searchMessages(access.token,query,pageToken);
}
export async function previewMessage(target: GmailTarget, messageId: string) {
  const access = await accessToken(target);
  const data = await readMessage(access.token,messageId);
  return { ...data, email: access.email };
}
export async function saveMessage(target: GmailTarget, messageId: string, expectedHash: string) {
  const access = await accessToken(target), archive = await readMessage(access.token,messageId);
  const hash = snapshotHash(archive.snapshot);
  if (hash !== expectedHash) throw new GmailError("El correo cambió desde su revisión. Revísalo nuevamente", 409);
  return prisma.$transaction(async tx => {
    await lock(tx,target); await assertTarget(tx,target);
    const row = await connection(tx,target);
    if (!row || row.status !== "connected" || row.email_address !== access.email || row.oauth_client_id !== gmailConfig().clientId) {
      throw new GmailError("La conexión de Gmail cambió. Recarga el expediente", 409);
    }
    const sourceId = randomUUID(), linkId = randomUUID();
    await tx.$executeRaw`INSERT INTO gmail_message_copies(copy_id,tenant_id,actor_id,email_address,message_id,snapshot_hash,encrypted_archive)
      VALUES (${sourceId},${target.tenantId},${target.actorId},${access.email},${messageId},${hash},
        ${seal(JSON.stringify(archive),sourceContext(target,access.email,messageId,hash))})
      ON CONFLICT(tenant_id,actor_id,email_address,message_id,snapshot_hash) DO NOTHING`;
    const copies = await tx.$queryRaw<{ copy_id: string }[]>`SELECT copy_id FROM gmail_message_copies
      WHERE tenant_id=${target.tenantId} AND actor_id=${target.actorId} AND email_address=${access.email} AND message_id=${messageId} AND snapshot_hash=${hash}`;
    const saved = await tx.$queryRaw<{ link_id: string }[]>`INSERT INTO gmail_opportunity_links(link_id,tenant_id,actor_id,client_id,opportunity_id,copy_id)
      VALUES (${linkId},${target.tenantId},${target.actorId},${target.clientId},${target.opportunityId},${copies[0].copy_id})
      ON CONFLICT(tenant_id,actor_id,opportunity_id,copy_id) DO NOTHING RETURNING link_id`;
    if (saved.length) {
      await tx.$executeRaw`INSERT INTO gmail_link_events(event_id,link_id,actor_id,event_type)
        VALUES (${randomUUID()},${linkId},${target.actorId},'message_linked')`;
    }
    return { unchanged: !saved.length };
  }, { timeout: 15_000, maxWait: 3000 });
}
export async function listLinks(target: GmailTarget): Promise<GmailLink[]> {
  const rows = await prisma.$queryRaw<{ link_id: string; linked_at: Date; message_id: string; email_address: string;
    snapshot_hash: string; encrypted_archive: string }[]>`SELECT l.link_id,l.linked_at,c.message_id,c.email_address,c.snapshot_hash,c.encrypted_archive
      FROM gmail_opportunity_links l JOIN gmail_message_copies c ON c.copy_id=l.copy_id AND c.tenant_id=l.tenant_id AND c.actor_id=l.actor_id
      WHERE l.tenant_id=${target.tenantId} AND l.actor_id=${target.actorId} AND l.client_id=${target.clientId} AND l.opportunity_id=${target.opportunityId}
      ORDER BY l.linked_at DESC,l.link_id LIMIT 50`;
  return rows.map(row => {
    const archive = JSON.parse(unseal(row.encrypted_archive,sourceContext(target,row.email_address,row.message_id,row.snapshot_hash))) as { snapshot: GmailSnapshot };
    if (snapshotHash(archive.snapshot) !== row.snapshot_hash) throw new GmailError("No se pudo verificar la copia del correo", 409);
    return { linkId: row.link_id, snapshotHash: row.snapshot_hash, linkedAt: row.linked_at.toISOString(), message: messageView(archive.snapshot) };
  });
}
export async function savedAttachment(target: GmailTarget, linkId: string, partId: string) {
  const rows = await prisma.$queryRaw<{ message_id: string; email_address: string; snapshot_hash: string; encrypted_archive: string }[]>`
    SELECT c.message_id,c.email_address,c.snapshot_hash,c.encrypted_archive FROM gmail_opportunity_links l
      JOIN gmail_message_copies c ON c.copy_id=l.copy_id AND c.tenant_id=l.tenant_id AND c.actor_id=l.actor_id
    WHERE l.tenant_id=${target.tenantId} AND l.actor_id=${target.actorId} AND l.opportunity_id=${target.opportunityId}
      AND l.client_id=${target.clientId} AND l.link_id=${linkId}`;
  const row = rows[0]; if (!row) throw new GmailError("Documento no encontrado",404);
  const archive = JSON.parse(unseal(row.encrypted_archive,sourceContext(target,row.email_address,row.message_id,row.snapshot_hash))) as { snapshot: GmailSnapshot };
  const attachment = archive.snapshot.attachments.find(a => a.partId===partId);
  if (!attachment || snapshotHash(archive.snapshot)!==row.snapshot_hash || digest(Buffer.from(attachment.data,"base64"))!==attachment.sha256) {
    throw new GmailError("Documento no encontrado o copia no verificable",404);
  }
  return attachment;
}
export async function disconnectAccount(actor: GmailActor) {
  await prisma.$transaction(async tx => {
    await lock(tx,actor); await assertGmailActor(tx,actor);
    await tx.$executeRaw`UPDATE gmail_connections SET credentials=NULL,status='disconnected' WHERE tenant_id=${actor.tenantId} AND actor_id=${actor.actorId}`;
    await tx.$executeRaw`UPDATE gmail_oauth_attempts SET revoked_at=now() WHERE tenant_id=${actor.tenantId} AND actor_id=${actor.actorId} AND revoked_at IS NULL`;
  });
}
