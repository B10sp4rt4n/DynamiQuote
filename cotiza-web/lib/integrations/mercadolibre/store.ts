import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { digest, seal, unseal } from "./crypto";
import { exchangeToken, searchSales, verifyAccount, type MercadoLibreSale, type MercadoLibreToken } from "./client";
import { MercadoLibreError } from "./config";

type Connection = { tenant_id: string; seller_id: string; nickname: string; credentials: string | null;
  expires_at: Date; status: "connected" | "reconnect_required" | "disconnected"; last_sync_at: Date | null };
type Attempt = { verifier: string };
const context = (tenantId: string, sellerId: string) => `mercadolibre:tokens:${tenantId}:${sellerId}`;
async function lock(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mercadolibre:${tenantId}`}, 0))`;
}
async function connection(tx: Prisma.TransactionClient, tenantId: string) {
  const rows = await tx.$queryRaw<Connection[]>`SELECT * FROM mercadolibre_connections WHERE tenant_id=${tenantId}`;
  return rows[0] ?? null;
}

export async function beginAuthorization(tenantId: string, actorId: string, state: string, browser: string, verifier: string) {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`DELETE FROM mercadolibre_oauth_attempts WHERE tenant_id=${tenantId} AND expires_at < now() - interval '1 day'`;
    await tx.$executeRaw`INSERT INTO mercadolibre_oauth_attempts
      (state_hash, tenant_id, actor_id, browser_hash, verifier, expires_at)
      VALUES (${digest(state)}, ${tenantId}, ${actorId}, ${digest(browser)},
        ${seal(verifier, `mercadolibre:oauth:${tenantId}:${actorId}:${digest(state)}`)}, now() + interval '10 minutes')`;
  });
}

export async function consumeAuthorization(tenantId: string, actorId: string, state: string, browser: string) {
  const rows = await prisma.$queryRaw<Attempt[]>`UPDATE mercadolibre_oauth_attempts SET consumed_at=now()
    WHERE state_hash=${digest(state)} AND tenant_id=${tenantId} AND actor_id=${actorId}
      AND browser_hash=${digest(browser)} AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING verifier`;
  if (!rows[0]) throw new MercadoLibreError("La autorización venció o cambió la empresa o sesión. Vuelve a conectar", 422);
  return unseal(rows[0].verifier, `mercadolibre:oauth:${tenantId}:${actorId}:${digest(state)}`);
}

export async function connectAccount(tenantId: string, actorId: string, token: MercadoLibreToken, state: string) {
  const account = await verifyAccount(token);
  await prisma.$transaction(async tx => {
    await lock(tx, tenantId);
    const attempts = await tx.$queryRaw<{ state_hash: string }[]>`SELECT state_hash FROM mercadolibre_oauth_attempts
      WHERE state_hash=${digest(state)} AND tenant_id=${tenantId} AND actor_id=${actorId}
        AND consumed_at IS NOT NULL AND revoked_at IS NULL AND expires_at > now()`;
    if (!attempts.length) throw new MercadoLibreError("La autorización venció o fue desconectada; vuelve a conectar", 422);
    const existing = await connection(tx, tenantId);
    if (existing && existing.seller_id !== account.id) throw new MercadoLibreError("Esta empresa ya está vinculada a otra cuenta; conserva su historial", 409);
    const other = await tx.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM mercadolibre_connections WHERE seller_id=${account.id} AND tenant_id<>${tenantId}`;
    if (other.length) throw new MercadoLibreError("Esta cuenta ya está vinculada a otra empresa", 409);
    await tx.$executeRaw`INSERT INTO mercadolibre_connections
      (tenant_id,seller_id,nickname,credentials,expires_at,status,connected_by)
      VALUES (${tenantId},${account.id},${account.nickname},${seal(JSON.stringify(token), context(tenantId, account.id))},
        ${new Date(Date.now() + token.expires_in * 1000)},'connected',${actorId})
      ON CONFLICT (tenant_id) DO UPDATE SET nickname=EXCLUDED.nickname, credentials=EXCLUDED.credentials,
        expires_at=EXCLUDED.expires_at,status='connected',connected_by=EXCLUDED.connected_by,connected_at=now()`;
  });
}

// Serialize single-use refresh tokens across processes. Commit rotation BEFORE any
// order reads or imports, so a failed import cannot roll back an already used token.
export async function accessToken(tenantId: string): Promise<{ token: string; sellerId: string }> {
  const result = await prisma.$transaction(async tx => {
    await lock(tx, tenantId);
    const row = await connection(tx, tenantId);
    if (!row || row.status !== "connected" || !row.credentials) return null;
    try {
      let token = JSON.parse(unseal(row.credentials, context(tenantId, row.seller_id))) as MercadoLibreToken;
      if (row.expires_at.getTime() < Date.now() + 60000) {
        token = await exchangeToken({ grant_type: "refresh_token", refresh_token: token.refresh_token });
        if (token.user_id !== row.seller_id) throw Error("Account mismatch");
        await tx.$executeRaw`UPDATE mercadolibre_connections SET credentials=${seal(JSON.stringify(token), context(tenantId, row.seller_id))},
          expires_at=${new Date(Date.now() + token.expires_in * 1000)} WHERE tenant_id=${tenantId}`;
      }
      return { token: token.access_token, sellerId: row.seller_id };
    } catch {
      // A timeout may mean the refresh was consumed remotely. Never replay it.
      await tx.$executeRaw`UPDATE mercadolibre_connections SET status='reconnect_required',credentials=NULL WHERE tenant_id=${tenantId}`;
      return null;
    }
  }, { timeout: 20000, maxWait: 2000 });
  if (!result) throw new MercadoLibreError("Conecta o vuelve a autorizar la cuenta de Mercado Libre", 409);
  return result;
}

export async function saveSales(tx: Prisma.TransactionClient, tenantId: string, sellerId: string, actorId: string, sales: MercadoLibreSale[]) {
  let inserted = 0, updated = 0;
  for (const sale of sales) {
    if (sale.sellerId !== sellerId) throw new MercadoLibreError("La venta pertenece a otra cuenta", 422);
    const snapshot = JSON.stringify(sale), hash = digest(snapshot);
    const previous = await tx.$queryRaw<{ snapshot_hash: string }[]>`SELECT snapshot_hash FROM mercadolibre_sales
      WHERE tenant_id=${tenantId} AND seller_id=${sellerId} AND order_id=${sale.orderId} FOR UPDATE`;
    if (!previous[0]) inserted++;
    else if (previous[0].snapshot_hash !== hash) updated++;
    await tx.$executeRaw`INSERT INTO mercadolibre_sales (tenant_id,seller_id,order_id,snapshot,snapshot_hash,imported_by)
      VALUES (${tenantId},${sellerId},${sale.orderId},${snapshot}::jsonb,${hash},${actorId})
      ON CONFLICT (tenant_id,seller_id,order_id) DO UPDATE
        SET snapshot=EXCLUDED.snapshot,snapshot_hash=EXCLUDED.snapshot_hash,checked_at=now()`;
    if (!previous[0] || previous[0].snapshot_hash !== hash) {
      await tx.$executeRaw`INSERT INTO mercadolibre_sale_revisions
        (tenant_id,seller_id,order_id,snapshot,snapshot_hash,observed_by)
        VALUES (${tenantId},${sellerId},${sale.orderId},${snapshot}::jsonb,${hash},${actorId})`;
    }
  }
  return { inserted, updated, unchanged: sales.length - inserted - updated };
}

export async function syncSales(tenantId: string, actorId: string, offset: number) {
  const access = await accessToken(tenantId);
  return prisma.$transaction(async tx => {
    await lock(tx, tenantId);
    const row = await connection(tx, tenantId);
    if (!row || row.status !== "connected" || row.seller_id !== access.sellerId) throw new MercadoLibreError("La conexión cambió; recarga la página");
    const page = await searchSales(access.token, access.sellerId, offset);
    const result = await saveSales(tx, tenantId, access.sellerId, actorId, page.sales);
    await tx.$executeRaw`UPDATE mercadolibre_connections SET last_sync_at=now() WHERE tenant_id=${tenantId}`;
    return { ...result, total: page.total, nextOffset: page.nextOffset };
  }, { timeout: 20000, maxWait: 2000 });
}

export async function disconnectAccount(tenantId: string) {
  await prisma.$transaction(async tx => {
    await lock(tx, tenantId);
    await tx.$executeRaw`UPDATE mercadolibre_connections SET status='disconnected',credentials=NULL WHERE tenant_id=${tenantId}`;
    // Invalidate pending authorizations to prevent a callback from restoring a disconnected account.
    await tx.$executeRaw`UPDATE mercadolibre_oauth_attempts SET revoked_at=now() WHERE tenant_id=${tenantId} AND revoked_at IS NULL`;
  });
}

export async function readInbox(tenantId: string, offset = 0) {
  const [rows, sales, count] = await Promise.all([
    prisma.$queryRaw<Pick<Connection, "seller_id" | "nickname" | "status" | "last_sync_at">[]>`
      SELECT seller_id,nickname,status,last_sync_at FROM mercadolibre_connections WHERE tenant_id=${tenantId}`,
    prisma.$queryRaw<{ snapshot: MercadoLibreSale; checked_at: Date }[]>`
      SELECT snapshot,checked_at FROM mercadolibre_sales WHERE tenant_id=${tenantId}
      ORDER BY (snapshot->>'createdAt')::timestamptz DESC, order_id DESC LIMIT 50 OFFSET ${offset}`,
    prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM mercadolibre_sales WHERE tenant_id=${tenantId}`,
  ]);
  const row = rows[0];
  return { connection: row ? { sellerId: row.seller_id, nickname: row.nickname, status: row.status,
    lastSyncAt: row.last_sync_at?.toISOString() ?? null } : null,
    sales: sales.map(sale => ({ ...sale.snapshot, checkedAt: sale.checked_at.toISOString() })), total: count[0].count };
}
