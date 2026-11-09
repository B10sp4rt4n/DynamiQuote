import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const provider = vi.hoisted(() => ({ exchange: vi.fn(), account: vi.fn(), search: vi.fn() }));
vi.mock("./client", async () => ({ ...await vi.importActual("./client"), exchangeToken: provider.exchange, verifyAccount: provider.account, searchSales: provider.search }));
import type { MercadoLibreSale } from "./client";
const suite = process.env.COTIZA_ML_TEST_DATABASE_URL ? describe : describe.skip;
suite("Mercado Libre persistence on disposable PostgreSQL", () => {
  let db: typeof import("@/lib/db/prisma").prisma, store: typeof import("./store"), pool: Pool;
  const suffix = randomUUID(), tenant = `ml-${suffix}`, other = `ml-other-${suffix}`, actor = "synthetic-admin";
  const token = { access_token: "synthetic-access-private", refresh_token: "synthetic-refresh-private", expires_in: 21600, user_id: "123" };
  const sale: MercadoLibreSale = { orderId: "2000000000000001", packId: "2000000000000002", sellerId: "123", buyerId: "456", status: "paid", currency: "MXN",
    createdAt: "2026-11-09T08:00:00-06:00", total: "1160", items: [{ itemId: "MLM1", title: "Synthetic product", sku: "P1", quantity: 1, unitPrice: "1160" }] };
  async function authorize(company = tenant) {
    const state = randomUUID(); await store.beginAuthorization(company, actor, state, "browser", "verifier");
    expect(await store.consumeAuthorization(company, actor, state, "browser")).toBe("verifier");
    await store.connectAccount(company, actor, token, state); return state;
  }
  beforeAll(async () => {
    const url = new URL(process.env.COTIZA_ML_TEST_DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.includes("cotiza_ml_synthetic")) throw Error("Disposable local cotiza_ml_synthetic database required");
    vi.stubEnv("DATABASE_URL", url.toString()); vi.stubEnv("MERCADOLIBRE_CLIENT_ID", "12345"); vi.stubEnv("MERCADOLIBRE_CLIENT_SECRET", "synthetic-only");
    vi.stubEnv("MERCADOLIBRE_REDIRECT_URI", "https://cotiza.test/api/integrations/mercadolibre/callback"); vi.stubEnv("MERCADOLIBRE_TOKEN_KEY", "ab".repeat(32));
    pool = new Pool({ connectionString: url.toString(), max: process.env.COTIZA_ML_PGLITE === "1" ? 1 : 10 });
    // Reuse the explicit disposable pool; never load local .env files or application data.
    (globalThis as unknown as { pool: Pool }).pool = pool;
    await pool.query("CREATE TABLE IF NOT EXISTS tenants (tenant_id text PRIMARY KEY, name text, slug text, active boolean DEFAULT true, created_at timestamp DEFAULT now())");
    const sql = readFileSync(new URL("../../../prisma/manual/20261109_mercadolibre.sql", import.meta.url), "utf8");
    await pool.query(sql); await pool.query(sql);
    await pool.query("INSERT INTO tenants(tenant_id,name,slug) VALUES ($1,$1,$1),($2,$2,$2)", [tenant, other]);
    ({ prisma: db } = await import("@/lib/db/prisma")); store = await import("./store");
    provider.account.mockResolvedValue({ id: "123", nickname: "Synthetic seller", site_id: "MLM" });
    provider.exchange.mockResolvedValue({ ...token, access_token: "rotated-access", refresh_token: "rotated-refresh" });
    provider.search.mockResolvedValue({ sales: [sale], total: 1, nextOffset: null });
  });
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); vi.unstubAllEnvs(); });
  it("binds OAuth to company, actor and browser, consumes once, and encrypts credentials", async () => {
    const state = randomUUID(); await store.beginAuthorization(tenant, actor, state, "browser", "verifier");
    for (const [company, user, browser] of [[other, actor, "browser"], [tenant, "foreign", "browser"], [tenant, actor, "foreign"]]) {
      await expect(store.consumeAuthorization(company, user, state, browser)).rejects.toMatchObject({ status: 422 });
    }
    expect(await store.consumeAuthorization(tenant, actor, state, "browser")).toBe("verifier");
    await expect(store.consumeAuthorization(tenant, actor, state, "browser")).rejects.toMatchObject({ status: 422 });
    await store.connectAccount(tenant, actor, token, state);
    const result = await pool.query("SELECT credentials FROM mercadolibre_connections WHERE tenant_id=$1", [tenant]);
    expect(result.rows[0].credentials).not.toContain("synthetic-");
    const inbox = await store.readInbox(tenant); expect(inbox.connection).toMatchObject({ sellerId: "123", status: "connected" });
    expect(JSON.stringify(inbox)).not.toMatch(/credentials|access_token|refresh_token/);
  });
  it("prevents a seller from being linked to another company", async () => {
    await expect(authorize(other)).rejects.toMatchObject({ status: 409 });
    expect((await store.readInbox(other)).sales).toEqual([]);
  });
  it("imports once, retries without duplication and preserves each changed observation", async () => {
    expect(await store.syncSales(tenant, actor, 0)).toMatchObject({ inserted: 1, updated: 0 });
    expect(await store.syncSales(tenant, actor, 0)).toMatchObject({ inserted: 0, updated: 0, unchanged: 1 });
    provider.search.mockResolvedValue({ sales: [{ ...sale, status: "cancelled" }], total: 1, nextOffset: null });
    expect(await store.syncSales(tenant, actor, 0)).toMatchObject({ inserted: 0, updated: 1 });
    expect((await store.readInbox(tenant)).sales[0].status).toBe("cancelled");
    expect((await pool.query("SELECT count(*)::int AS n FROM mercadolibre_sale_revisions WHERE tenant_id=$1", [tenant])).rows[0].n).toBe(2);
    expect((await store.readInbox(other)).total).toBe(0);
    await expect(store.syncSales(other, actor, 0)).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back a page if a foreign seller appears and keeps existing history", async () => {
    provider.search.mockResolvedValue({ sales: [{ ...sale, orderId: "2000000000000003" }, { ...sale, sellerId: "999" }], total: 2, nextOffset: null });
    await expect(store.syncSales(tenant, actor, 0)).rejects.toThrow(/otra cuenta/);
    expect((await store.readInbox(tenant)).total).toBe(1);
  });
  it("commits token rotation even if the following order query fails", async () => {
    await pool.query("UPDATE mercadolibre_connections SET expires_at=now() - interval '1 minute' WHERE tenant_id=$1", [tenant]);
    provider.search.mockRejectedValueOnce(Error("Synthetic provider unavailable"));
    provider.exchange.mockClear(); await expect(store.syncSales(tenant, actor, 0)).rejects.toThrow();
    expect((await store.accessToken(tenant)).token).toBe("rotated-access"); expect(provider.exchange).toHaveBeenCalledTimes(1);
  });
  it.skipIf(process.env.COTIZA_ML_PGLITE === "1")("serializes concurrent refresh and imports on PostgreSQL", async () => {
    await pool.query("UPDATE mercadolibre_connections SET expires_at=now() - interval '1 minute' WHERE tenant_id=$1", [tenant]);
    provider.exchange.mockClear(); await Promise.all([store.accessToken(tenant), store.accessToken(tenant)]);
    expect(provider.exchange).toHaveBeenCalledTimes(1);
    provider.search.mockResolvedValue({ sales: [sale], total: 1, nextOffset: null });
    const results = await Promise.all([store.syncSales(tenant, actor, 0), store.syncSales(tenant, actor, 0)]);
    expect(results.reduce((n, row) => n + row.inserted, 0)).toBe(0);
    expect(results.reduce((n, row) => n + row.updated, 0)).toBe(1);
    expect((await store.readInbox(tenant)).total).toBe(1);
  });
  it("does not retry an uncertain refresh and requires reconnecting", async () => {
    await pool.query("UPDATE mercadolibre_connections SET expires_at=now() - interval '1 minute' WHERE tenant_id=$1", [tenant]);
    provider.exchange.mockRejectedValueOnce(Error("Synthetic timeout")); provider.exchange.mockClear();
    await expect(store.accessToken(tenant)).rejects.toMatchObject({ status: 409 });
    await expect(store.accessToken(tenant)).rejects.toMatchObject({ status: 409 });
    expect(provider.exchange).toHaveBeenCalledTimes(1);
    expect((await store.readInbox(tenant)).connection?.status).toBe("reconnect_required");
  });
  it("disconnects without deleting history and invalidates callbacks already being exchanged", async () => {
    await authorize(); const state = randomUUID();
    await store.beginAuthorization(tenant, actor, state, "browser", "verifier"); await store.consumeAuthorization(tenant, actor, state, "browser");
    await store.disconnectAccount(tenant);
    await expect(store.connectAccount(tenant, actor, token, state)).rejects.toMatchObject({ status: 422 });
    expect((await store.readInbox(tenant)).connection?.status).toBe("disconnected"); expect((await store.readInbox(tenant)).total).toBe(1);
    expect((await pool.query("SELECT credentials FROM mercadolibre_connections WHERE tenant_id=$1", [tenant])).rows[0].credentials).toBeNull();
    await authorize(); expect((await store.readInbox(tenant)).connection?.status).toBe("connected");
  });
});
