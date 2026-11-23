import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const databaseUrl = process.env.COTIZA_EVIDENCE_TEST_DATABASE_URL;
const seedId = "389b6cc1-2f8d-4fe4-bc3d-f50f92df3157";
const evidenceSql = new URL("../../prisma/manual/20261123_commercial_evidence.sql", import.meta.url);
const capabilitySql = new URL("../../prisma/manual/20261022_tenant_capabilities.sql", import.meta.url);
let pool: Pool;
let previousDatabaseUrl: string | undefined;
let db: typeof import("./prisma").prisma;

beforeAll(async () => {
  if (!databaseUrl) return;
  const parsed = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.pathname !== "/cotiza_evidence_test") {
    throw new Error("Usa exclusivamente una base local vacía llamada cotiza_evidence_test.");
  }
  pool = new Pool({ connectionString: databaseUrl });
  await pool.query(`
    CREATE TABLE tenants (tenant_id text PRIMARY KEY, active boolean NOT NULL);
    CREATE TABLE quotes (quote_id text PRIMARY KEY, tenant_id text NOT NULL);
  `);
  await pool.query("INSERT INTO tenants VALUES ($1, true), ('other', true)", [seedId]);
  await pool.query("INSERT INTO quotes VALUES ('v1', $1), ('v2', $1), ('v3', $1), ('outside', 'other')", [seedId]);
  await pool.query(await readFile(capabilitySql, "utf8"));
  await pool.query(await readFile(evidenceSql, "utf8"));
  previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  ({ prisma: db } = await import("./prisma"));
});

afterAll(async () => {
  await db?.$disconnect();
  await pool?.end();
  if (db) {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

it.runIf(Boolean(databaseUrl))("deduplicates original PDF bytes, shares exact links and isolates companies", async () => {
  const { getCommercialEvidenceFile, linkCommercialEvidence, listCommercialEvidence, requireCommercialEvidence, storeCommercialEvidence } =
    await import("./commercial-evidence");
  const pdf = { bytes: new TextEncoder().encode("%PDF-original"), filename: "Q-123.pdf", supplier: "ThreatDown",
    reference: "Q-123", expiresOn: "2026-12-31" };
  const attach = (quoteId: string) => db.$transaction(async tx => {
    await requireCommercialEvidence(tx, seedId);
    const id = await storeCommercialEvidence(tx, seedId, "seller", pdf);
    await linkCommercialEvidence(tx, seedId, "seller", id, [quoteId]);
    return id;
  });
  const [evidenceId, duplicateId] = await Promise.all([attach("v1"), attach("v2")]);
  expect(duplicateId).toBe(evidenceId);
  expect(await attach("v1")).toBe(evidenceId);
  expect((await listCommercialEvidence(seedId, ["v1", "v2", "v3"])).map(link => link.quoteId)).toEqual(["v1", "v2"]);
  expect(await getCommercialEvidenceFile(seedId, "v1", evidenceId)).toEqual({ filename: pdf.filename, bytes: pdf.bytes });
  expect(await getCommercialEvidenceFile(seedId, "v3", evidenceId)).toBeNull();
  expect(await getCommercialEvidenceFile("other", "v1", evidenceId)).toBeNull();
  await expect(db.$transaction(tx => requireCommercialEvidence(tx, "other"))).rejects.toMatchObject({ status: 403 });
  await expect(db.$transaction(tx => linkCommercialEvidence(tx, seedId, "seller", evidenceId, ["outside"]))).rejects.toThrow();
});

it.runIf(Boolean(databaseUrl))("seeds only SynAppsSys and preserves a later opt-out across migration reruns", async () => {
  const rows = await pool.query("SELECT tenant_id, enabled FROM tenant_capabilities WHERE capability_key = 'commercial_evidence'");
  expect(rows.rows).toEqual([{ tenant_id: seedId, enabled: true }]);
  await pool.query("UPDATE tenant_capabilities SET enabled = false WHERE capability_key = 'commercial_evidence'");
  await pool.query(await readFile(evidenceSql, "utf8"));
  const after = await pool.query("SELECT tenant_id, enabled FROM tenant_capabilities WHERE capability_key = 'commercial_evidence'");
  expect(after.rows).toEqual([{ tenant_id: seedId, enabled: false }]);
  const events = await pool.query("SELECT tenant_id FROM tenant_capability_events WHERE capability_key = 'commercial_evidence'");
  expect(events.rows).toEqual([{ tenant_id: seedId }]);
});
