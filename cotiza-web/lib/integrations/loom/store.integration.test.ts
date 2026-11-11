import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { reviewLoomFollowup, verifyLoomFollowup } from "./followup";
import type { LoomFollowup, LoomSnapshot, LoomTarget } from "./domain";
const suite = process.env.COTIZA_LOOM_TEST_DATABASE_URL ? describe : describe.skip;
suite("Loom copies on disposable PostgreSQL", () => {
  let db: typeof import("@/lib/db/prisma").prisma, store: typeof import("./store"), followups: typeof import("./followup-store"), pool: Pool;
  const suffix = randomUUID(), tenant = "loom-" + suffix, other = "other-" + suffix, actor = "super-" + suffix, actor2 = "second-" + suffix;
  const client = "client-" + suffix, client2 = "client2-" + suffix, opp = "opp-" + suffix;
  const target: LoomTarget = { tenantId: tenant, actorId: actor, connectionKey: "c".repeat(64), clientId: client, opportunityId: opp };
  const snapshot: LoomSnapshot = { sourceId: "a".repeat(32), ari: "ari:source", url: "https://www.loom.com/share/" + "a".repeat(32),
    title: "Prueba PostgreSQL", type: "ASYNC_VIDEO", createdAt: null, durationSeconds: 10, transcript: "[0:01] Original",
    transcriptStatus: "ready", sourceStatus: "READY", observedAt: "2026-11-10T18:00:00Z" };
  beforeAll(async () => {
    const url = new URL(process.env.COTIZA_LOOM_TEST_DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/cotiza_loom_synthetic") throw Error("Disposable local cotiza_loom_synthetic database required");
    vi.stubEnv("DATABASE_URL", url.toString());
    pool = new Pool({ connectionString: url.toString(), max: 8 });
    const globals = globalThis as unknown as { pool: Pool; prisma?: typeof db }; globals.pool = pool; delete globals.prisma;
    await pool.query("CREATE TABLE tenants(tenant_id text PRIMARY KEY,active boolean NOT NULL DEFAULT true); CREATE TABLE app_users(user_id text PRIMARY KEY,role text NOT NULL,active boolean NOT NULL DEFAULT true); CREATE TABLE clients(client_id text PRIMARY KEY,tenant_id text NOT NULL REFERENCES tenants(tenant_id)); CREATE TABLE opportunities(opportunity_id text PRIMARY KEY,tenant_id text NOT NULL,client_id text NOT NULL); CREATE TABLE tenant_capabilities(tenant_id text,capability_key text,enabled boolean NOT NULL,PRIMARY KEY(tenant_id,capability_key));");
    await pool.query("CREATE TABLE tasks(task_id text PRIMARY KEY,tenant_id text,client_id text,opportunity_id text,description text,due_date date,completed_at timestamp,created_by_user_id text,created_at timestamp); CREATE TABLE interaction_logs(interaction_id text PRIMARY KEY,tenant_id text,client_id text,opportunity_id text,note text,created_by_user_id text,created_at timestamp)");
    const sql = readFileSync(new URL("../../../prisma/manual/20261110_loom_context.sql", import.meta.url), "utf8");
    await pool.query(sql); await pool.query(sql);
    await pool.query("INSERT INTO tenants(tenant_id) VALUES ($1),($2)", [tenant, other]);
    await pool.query("INSERT INTO app_users(user_id,role) VALUES ($1,'superadmin'),($2,'superadmin')", [actor, actor2]);
    await pool.query("INSERT INTO clients(client_id,tenant_id) VALUES ($1,$2),($3,$4)", [client, tenant, client2, other]);
    await pool.query("INSERT INTO opportunities(opportunity_id,tenant_id,client_id) VALUES ($1,$2,$3)", [opp, tenant, client]);
    await pool.query("INSERT INTO tenant_capabilities VALUES ($1,'loom_context_pilot',true),($2,'loom_context_pilot',true)", [tenant, other]);
    ({ prisma: db } = await import("@/lib/db/prisma")); store = await import("./store"); followups = await import("./followup-store");
  });
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); vi.unstubAllEnvs(); });
  it("serializes simultaneous confirmations and preserves one link and one initial version", async () => {
    const results = await Promise.all([store.saveLoomLink(target, snapshot, null), store.saveLoomLink(target, snapshot, null)]);
    expect(results[0].link.linkId).toBe(results[1].link.linkId);
    expect(results.filter(x => x.unchanged)).toHaveLength(1);
    expect(await store.getLoomRevision(target, snapshot.sourceId)).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM loom_recording_versions")).rows[0].n).toBe(1);
  });
  it("keeps copies private to the actor, connection, company and dossier", async () => {
    for (const changed of [{ ...target, actorId: actor2 }, { ...target, connectionKey: "d".repeat(64) },
      { ...target, tenantId: other }, { ...target, opportunityId: null }]) {
      expect(await store.listLoomLinks(changed)).toEqual([]);
    }
    expect(await store.listLoomLinks(target)).toHaveLength(1);
  });
  it("rejects stale reviews and retains both exact content versions after an explicit refresh", async () => {
    const changed = { ...snapshot, transcript: "[0:01] Revised" };
    await expect(store.saveLoomLink(target, changed, null)).rejects.toMatchObject({ status: 409 });
    const saved = await store.saveLoomLink(target, changed, 1); expect(saved.link.revision).toBe(2);
    const versions = await pool.query("SELECT snapshot FROM loom_recording_versions WHERE link_id=$1 ORDER BY revision", [saved.link.linkId]);
    expect(versions.rows.map(x => x.snapshot.transcript)).toEqual([snapshot.transcript, changed.transcript]);
  });
  it("never overwrites a complete transcript with an unavailable component", async () => {
    await expect(store.saveLoomLink(target, { ...snapshot, transcript: null, transcriptStatus: "unavailable", sourceStatus: "ABSENT" }, 2)).rejects.toMatchObject({ status: 409 });
    expect((await store.listLoomLinks(target))[0]!.snapshot.transcript).toContain("Revised");
  });
  it("rechecks capability and database role at commit time", async () => {
    await pool.query("UPDATE tenant_capabilities SET enabled=false WHERE tenant_id=$1", [tenant]);
    await expect(store.saveLoomLink(target, { ...snapshot, title: "Blocked" }, 2)).rejects.toMatchObject({ status: 403 });
    await pool.query("UPDATE tenant_capabilities SET enabled=true WHERE tenant_id=$1", [tenant]);
    await pool.query("UPDATE app_users SET role='owner' WHERE user_id=$1", [actor]);
    await expect(store.saveLoomLink(target, { ...snapshot, title: "Blocked" }, 2)).rejects.toMatchObject({ status: 403 });
    await pool.query("UPDATE app_users SET role='superadmin' WHERE user_id=$1", [actor]);
    expect(await store.getLoomRevision(target, snapshot.sourceId)).toBe(2);
  });
  it("rolls back mismatched client/opportunity bindings and enforces the same boundary in PostgreSQL", async () => {
    await expect(store.saveLoomLink({ ...target, tenantId: other, clientId: client2 }, snapshot, null)).rejects.toMatchObject({ status: 409 });
    const sql = "INSERT INTO loom_recording_links(link_id,tenant_id,actor_id,connection_key,client_id,opportunity_id,source_id,snapshot,snapshot_hash,revision) VALUES ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,$8,1)";
    await expect(pool.query(sql, [randomUUID(), other, actor, target.connectionKey, client, opp, snapshot.sourceId, "f".repeat(64)])).rejects.toMatchObject({ code: "23503" });
    expect((await pool.query("SELECT count(*)::int n FROM loom_recording_links")).rows[0].n).toBe(1);
  });
  const key = Buffer.from("ab".repeat(32), "hex");
  async function reviewed(kind: "note" | "task", description = "Confirmar cantidades") {
    const link = (await store.listLoomLinks(target))[0]!;
    const value: LoomFollowup = kind === "task" ? { kind, excerpt: "Revised", description, dueDate: "2026-11-12" } : { kind, excerpt: "Revised", description, dueDate: null };
    const preview = reviewLoomFollowup(target, link, value, key);
    return verifyLoomFollowup(preview.token, target, key);
  }
  it("saves the existing bitacora once under simultaneous confirmations and retains exact provenance", async () => {
    const draft = await reviewed("note"), results = await Promise.all([followups.saveLoomFollowup(target, draft), followups.saveLoomFollowup(target, draft)]);
    expect(results[0].resultId).toBe(results[1].resultId); expect(results.filter(r => r.unchanged)).toHaveLength(1);
    const notes = await pool.query("SELECT * FROM interaction_logs"); expect(notes.rows).toHaveLength(1);
    expect(notes.rows[0]).toMatchObject({ tenant_id: tenant, client_id: client, opportunity_id: opp, created_by_user_id: actor });
    expect(notes.rows[0].note).toContain(snapshot.url); expect(notes.rows[0].note).toContain("Pasaje: Revised");
    expect((await pool.query("SELECT revision,source_excerpt FROM loom_followup_receipts")).rows[0]).toEqual({ revision: 2, source_excerpt: "Revised" });
  });
  it("saves a dated task in the existing task table and refuses a stale source review", async () => {
    const draft = await reviewed("task"); await followups.saveLoomFollowup(target, draft);
    const tasks = await pool.query("SELECT *,due_date::text day FROM tasks");
    expect(tasks.rows).toHaveLength(1); expect(tasks.rows[0]).toMatchObject({ tenant_id: tenant, client_id: client, opportunity_id: opp, day: "2026-11-12", completed_at: null });
    const stale = await reviewed("task", "Stale review");
    await store.saveLoomLink(target, { ...snapshot, transcript: "[0:01] Revised", title: "New source title" }, 2);
    await expect(followups.saveLoomFollowup(target, stale)).rejects.toMatchObject({ status: 409 });
    expect((await pool.query("SELECT count(*)::int n FROM tasks")).rows[0].n).toBe(1);
  });
  it("rolls back the note if its provenance receipt cannot be saved", async () => {
    const draft = await reviewed("note", "Synthetic receipt failure");
    await pool.query("CREATE FUNCTION reject_loom_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description='Synthetic receipt failure' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_loom_receipt BEFORE INSERT ON loom_followup_receipts FOR EACH ROW EXECUTE FUNCTION reject_loom_receipt()");
    await expect(followups.saveLoomFollowup(target, draft)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int n FROM interaction_logs")).rows[0].n).toBe(1);
    await pool.query("DROP TRIGGER reject_loom_receipt ON loom_followup_receipts; DROP FUNCTION reject_loom_receipt()");
  });

});
