import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
const mock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mock }));
import { readCommercialExportRows } from "./commercial-export-source";

const suite = process.env.PGLITE_MODULE ? describe : describe.skip;
let db: { exec(sql: string): Promise<unknown>; query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>; close(): Promise<void> };
const scope = { tenantId: "a", userId: "seller", allSellers: false, includeCosts: false };
const start = new Date("2025-01-01T06:00:00Z"), end = new Date("2026-01-01T06:00:00Z");

suite("commercial source SELECT against disposable PostgreSQL", () => {
  beforeAll(async () => {
    const { PGlite } = await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);
    db = new PGlite();
    await db.exec(`
      CREATE TABLE proposals (proposal_id text PRIMARY KEY, tenant_id text, created_by_user_id text,
        outcome text, outcome_at timestamp, created_at timestamp);
      CREATE TABLE proposal_items (item_id text PRIMARY KEY, tenant_id text, proposal_id text,
        status text, subtotal_price numeric, subtotal_cost numeric);
      CREATE TABLE proposal_audit_events (event_id text PRIMARY KEY, tenant_id text, proposal_id text, event_type text);
      CREATE TABLE formal_proposals (proposal_doc_id text PRIMARY KEY, tenant_id text, proposal_id text, quote_id text, currency text);
      CREATE TABLE quotes (quote_id text PRIMARY KEY, tenant_id text, quote_group_id text, version int, client_id text);
      CREATE TABLE clients (client_id text PRIMARY KEY, tenant_id text);
      INSERT INTO proposals VALUES
        ('own','a','seller','won','2025-08-01','2024-01-01'),
        ('peer','a','other','won','2025-08-01','2025-01-01'),
        ('orphan','a',NULL,'won','2025-08-01','2025-01-01'),
        ('foreign','b','seller','won','2025-08-01','2025-01-01'),
        ('lost','a','seller','lost','2025-08-01','2025-01-01'),
        ('before','a','seller','won','2025-01-01 05:59:59.999','2025-01-01'),
        ('start','a','seller','won','2025-01-01 06:00:00','2024-01-01'),
        ('last','a','seller','won','2026-01-01 05:59:59.999','2025-01-01'),
        ('end','a','seller','won','2026-01-01 06:00:00','2025-01-01'),
        ('unknown','a','seller','won',NULL,'2024-01-01'),
        ('legacy','a','seller','won',NULL,'2025-04-01'),
        ('legacy-outside','a','seller','won',NULL,'2024-04-01');
      INSERT INTO proposal_audit_events VALUES
        ('legacy-creation-20261021:legacy','a','legacy','historical_creation_reference'),
        ('legacy-creation-20261021:legacy-outside','a','legacy-outside','historical_creation_reference');
      INSERT INTO proposal_items VALUES
        ('valid','a','own','active',0.30,0.10),
        ('deleted','a','own','deleted',9999,9999),
        ('cross','b','own','active',9999,9999),
        ('missing','a','unknown','active',NULL,NULL),
        ('partial-one','a','legacy','active',100,50),
        ('partial-two','a','legacy','active',NULL,NULL);
      INSERT INTO clients VALUES ('client','a'),('foreign-client','b');
      INSERT INTO quotes VALUES ('q','a','lineage',1,'client'), ('q-foreign','b','foreign-lineage',1,'foreign-client');
      INSERT INTO formal_proposals VALUES
        ('f1','a','own','q','MXN'), ('f2','a','own','q','MXN'),
        ('f3','b','own','q-foreign','USD');
    `);
  }, 30_000);
  beforeEach(() => {
    mock.$queryRaw.mockClear();
    mock.$queryRaw.mockImplementation(async (query: Prisma.Sql) => (await db.query(query.text, query.values)).rows);
  });
  afterAll(async () => { if (db) await db.close(); });
  it("isolates tenant and exact seller, excluding orphan ownership", async () => {
    const rows = await readCommercialExportRows(scope, start, end);
    expect(rows.map(r => r.proposal_id)).toEqual(["last", "legacy", "own", "start", "unknown"]);
    expect(rows.every(r => r.tenant_id === "a" && r.seller_id === "seller")).toBe(true);
  });
  it("owner scope remains bounded to one tenant", async () => {
    const ids = (await readCommercialExportRows({ ...scope, allSellers: true }, start, end)).map(r => r.proposal_id);
    expect(ids).toContain("peer"); expect(ids).toContain("orphan"); expect(ids).not.toContain("foreign");
  });
  it("keeps decimal amounts exact without multiplying duplicated formal documents", async () => {
    const row = (await readCommercialExportRows({ ...scope, includeCosts: true }, start, end)).find(r => r.proposal_id === "own")!;
    expect(row.revenue).toBe("0.30"); expect(row.cost).toBe("0.10");
    expect(row.links).toEqual([{ quote_id: "q", lineage_id: "lineage", version: 1, client_id: "client", currency: "MXN" }]);
  });
  it("does not query cost columns for a seller", async () => {
    expect((await readCommercialExportRows(scope, start, end)).find(r => r.proposal_id === "own")?.cost).toBeNull();
    const query = mock.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.text).not.toContain("subtotal_cost");
    expect(query.text).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
  it("preserves missing and partially missing financials as null", async () => {
    const rows = await readCommercialExportRows({ ...scope, includeCosts: true }, start, end);
    for (const id of ["unknown", "start", "legacy"]) expect(rows.find(r => r.proposal_id === id)).toMatchObject({ revenue: null, cost: null });
  });
  it("respects CDMX annual boundaries and the exclusive end rather than creation date", async () => {
    const ids = (await readCommercialExportRows(scope, start, end)).map(r => r.proposal_id);
    expect(ids).toContain("start"); expect(ids).toContain("last");
    expect(ids).not.toContain("before"); expect(ids).not.toContain("end");
    expect(ids).toContain("own");
  });
  it("includes unknown dates for reconciliation and separates audited legacy", async () => {
    const rows = await readCommercialExportRows(scope, start, end);
    expect(rows.find(r => r.proposal_id === "unknown")?.reporting_at).toBeNull();
    expect(rows.find(r => r.proposal_id === "legacy")).toMatchObject({ outcome_at: null, legacy_act_ref: "legacy-creation-20261021:legacy" });
    expect(rows.some(r => r.proposal_id === "legacy-outside")).toBe(false);
  });
  it("binds hostile identity text as values, never SQL", async () => {
    expect(await readCommercialExportRows({ ...scope, tenantId: "a' OR 1=1 --" }, start, end)).toEqual([]);
    expect(await readCommercialExportRows({ ...scope, userId: "seller' OR 1=1 --" }, start, end)).toEqual([]);
  });
});
