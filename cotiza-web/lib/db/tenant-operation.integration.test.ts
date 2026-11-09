import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const suite = process.env.COTIZA_ML_TEST_DATABASE_URL ? describe : describe.skip;
suite("Operation profiles and channel independence on disposable PostgreSQL", () => {
  let pool: Pool, db: typeof import("./prisma").prisma;
  let profiles: typeof import("./tenant-operation"), capabilities: typeof import("./tenant-capabilities");
  const suffix = randomUUID(), tenant = `op-${suffix}`, other = `op-other-${suffix}`;
  const actor = { userId: "synthetic-superadmin", isSuperAdmin: true };
  beforeAll(async () => {
    const url = new URL(process.env.COTIZA_ML_TEST_DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.includes("cotiza_ml_synthetic")) throw Error("Disposable local cotiza_ml_synthetic database required");
    vi.stubEnv("DATABASE_URL", url.toString());
    pool = new Pool({ connectionString: url.toString(), max: process.env.COTIZA_ML_PGLITE === "1" ? 1 : 10 });
    (globalThis as unknown as { pool: Pool }).pool = pool;
    await pool.query("CREATE TABLE IF NOT EXISTS tenants (tenant_id text PRIMARY KEY, name text, slug text, active boolean DEFAULT true, created_at timestamp DEFAULT now())");
    for (const file of ["20261022_tenant_capabilities.sql", "20261109_tenant_operation.sql"]) {
      const sql = readFileSync(new URL(`../../prisma/manual/${file}`, import.meta.url), "utf8");
      await pool.query(sql); await pool.query(sql);
    }
    await pool.query("INSERT INTO tenants(tenant_id,name,slug) VALUES ($1,$1,$1),($2,$2,$2)", [tenant, other]);
    ({ prisma: db } = await import("./prisma")); profiles = await import("./tenant-operation"); capabilities = await import("./tenant-capabilities");
  });
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); vi.unstubAllEnvs(); });
  it("defaults existing tenants to consultative without granting a channel", async () => {
    expect(await profiles.getTenantOperationMode(tenant)).toBe("consultative");
    expect(await capabilities.isTenantCapabilityEnabled(tenant, "mercadolibre_channel")).toBe(false);
  });
  it("isolates the mode and keeps channels unchanged across all three modes", async () => {
    for (const mode of ["pos", "mixed", "consultative"] as const) {
      expect(await profiles.setTenantOperationMode({ tenantId: tenant, mode, actor })).toBe(mode);
      expect(await profiles.getTenantOperationMode(tenant)).toBe(mode);
      expect(await profiles.getTenantOperationMode(other)).toBe("consultative");
      expect(await capabilities.isTenantCapabilityEnabled(tenant, "mercadolibre_channel")).toBe(false);
    }
    const events = await pool.query("SELECT previous_mode, operation_mode, changed_by FROM tenant_operation_events WHERE tenant_id=$1 ORDER BY changed_at,event_id", [tenant]);
    expect(events.rows.map(row => [row.previous_mode, row.operation_mode])).toEqual([["consultative", "pos"], ["pos", "mixed"], ["mixed", "consultative"]]);
    expect(events.rows.every(row => row.changed_by === actor.userId)).toBe(true);
    await profiles.setTenantOperationMode({ tenantId: tenant, mode: "consultative", actor });
    expect((await pool.query("SELECT count(*)::int AS n FROM tenant_operation_events WHERE tenant_id=$1", [tenant])).rows[0].n).toBe(3);
  });
  it("enables only the selected tenant and preserves the channel grant through mode changes", async () => {
    await capabilities.setTenantCapability({ tenantId: tenant, capabilityKey: "mercadolibre_channel", enabled: true, actor });
    for (const mode of ["pos", "mixed", "consultative"] as const) {
      await profiles.setTenantOperationMode({ tenantId: tenant, mode, actor });
      expect(await capabilities.isTenantCapabilityEnabled(tenant, "mercadolibre_channel")).toBe(true);
      expect(await capabilities.isTenantCapabilityEnabled(other, "mercadolibre_channel")).toBe(false);
    }
    await capabilities.setTenantCapability({ tenantId: tenant, capabilityKey: "mercadolibre_channel", enabled: false, actor });
    expect(await profiles.getTenantOperationMode(tenant)).toBe("consultative");
    const audit = await pool.query("SELECT previous_enabled,enabled,changed_by FROM tenant_capability_events WHERE tenant_id=$1 ORDER BY changed_at", [tenant]);
    expect(audit.rows).toEqual([{ previous_enabled: null, enabled: true, changed_by: actor.userId }, { previous_enabled: true, enabled: false, changed_by: actor.userId }]);
  });
  it.skipIf(process.env.COTIZA_ML_PGLITE === "1")("serializes concurrent repeated saves without duplicating audit", async () => {
    await Promise.all([1, 2].map(() => profiles.setTenantOperationMode({ tenantId: other, mode: "mixed", actor })));
    expect((await pool.query("SELECT count(*)::int AS n FROM tenant_operation_events WHERE tenant_id=$1", [other])).rows[0].n).toBe(1);
  });
  it("rejects non-superadmins and inactive companies without writes", async () => {
    await expect(profiles.setTenantOperationMode({ tenantId: tenant, mode: "pos", actor: { ...actor, isSuperAdmin: false } })).rejects.toThrow("superadmin");
    await pool.query("UPDATE tenants SET active=false WHERE tenant_id=$1", [tenant]);
    expect(await profiles.setTenantOperationMode({ tenantId: tenant, mode: "pos", actor })).toBeNull();
    expect(await profiles.getTenantOperationMode(tenant)).toBe("consultative");
  });
});
