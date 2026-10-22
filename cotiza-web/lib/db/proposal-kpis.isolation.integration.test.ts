import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const mock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mock }));

import {
  getProposalAmountTimelineByTenant,
  getProposalKpiSummaryByTenant,
  getProposalMarginTimelineByTenant,
  getProposalOutcomeTimelineByTenant,
  getSalesRepRankingByTenant,
} from "./proposal-kpis";

// Optional disposable PostgreSQL engine. No DATABASE_URL, network, real users,
// or production data. Execute the application's generated, parameterized SQL.
const suite = process.env.PGLITE_MODULE ? describe : describe.skip;
type TestDatabase = {
  exec(sql: string): Promise<unknown>;
  query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
};
let db: TestDatabase;

suite("KPI isolation against disposable PostgreSQL", () => {
  beforeAll(async () => {
    const { PGlite } = await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);
    db = new PGlite();
    await db.exec(`
      CREATE TABLE proposals (
        proposal_id text PRIMARY KEY, tenant_id text, created_by_user_id text,
        status text, outcome text, created_at timestamp, outcome_at timestamp
      );
      CREATE TABLE proposal_items (
        item_id text PRIMARY KEY, proposal_id text, tenant_id text,
        status text, subtotal_price numeric, subtotal_cost numeric
      );
      CREATE TABLE app_users (
        user_id text PRIMARY KEY, tenant_id text, alias text, first_name text, last_name text
      );
      CREATE TABLE proposal_audit_events (
        event_id text PRIMARY KEY, tenant_id text, event_type text
      );
      INSERT INTO app_users VALUES
        ('seller-a', 'a', 'local', 'Local', 'Seller'),
        ('seller-b', 'b', 'private', 'Private', 'Foreign');
      INSERT INTO proposals VALUES
        ('a-own', 'a', 'seller-a', 'approved', 'won', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        ('a-foreign-author', 'a', 'seller-b', 'approved', 'won', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        ('b-own', 'b', 'seller-b', 'approved', 'won', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
      INSERT INTO proposal_items VALUES
        ('a-valid', 'a-own', 'a', 'active', 200, 120),
        ('a-second', 'a-foreign-author', 'a', 'active', 100, 30),
        ('b-valid', 'b-own', 'b', 'active', 900, 100),
        ('a-deleted', 'a-own', 'a', 'deleted', 8000, 1),
        ('foreign-child', 'a-own', 'b', 'active', 9999, 1);
    `);
  }, 30_000);

  beforeEach(() => {
    mock.$queryRaw.mockImplementation(async (query: Prisma.Sql) =>
      (await db.query(query.text, query.values)).rows,
    );
  });
  afterAll(async () => { if (db) await db.close(); });

  it("keeps tenant amounts correct even with a foreign child and a deleted item", async () => {
    expect(await getProposalKpiSummaryByTenant("a")).toMatchObject({
      totalCount: 2, wonAmount: 300, wonProfit: 150, proposedAmount: 300,
    });
    expect(await getProposalKpiSummaryByTenant("b")).toMatchObject({ totalCount: 1, wonAmount: 900 });
    expect(await getProposalKpiSummaryByTenant("absent")).toMatchObject({ totalCount: 0, wonAmount: 0 });
  });

  it("retains seller scope in addition to tenant scope", async () => {
    expect(await getProposalKpiSummaryByTenant("a", "seller-a", false)).toMatchObject({
      totalCount: 1, wonAmount: 200, wonProfit: 80,
    });
    expect(await getProposalKpiSummaryByTenant("a", "unknown", false)).toMatchObject({ totalCount: 0, wonAmount: 0 });
  });

  it("uses only local items in the proposed amount timeline", async () => {
    expect((await getProposalAmountTimelineByTenant("a")).reduce((sum, row) => sum + row.proposedAmount, 0)).toBe(300);
  });

  it("uses only local items in revenue and margin timelines", async () => {
    const rows = await getProposalMarginTimelineByTenant("a", "seller-a", false);
    expect(rows.reduce((sum, row) => sum + row.wonAmount, 0)).toBe(200);
    expect(rows.reduce((sum, row) => sum + row.wonProfit, 0)).toBe(80);
    expect(await getProposalMarginTimelineByTenant("absent")).toEqual([]);
  });

  it("counts decisions without including foreign child amounts", async () => {
    const rows = await getProposalOutcomeTimelineByTenant("a");
    expect(rows.reduce((sum, row) => sum + row.wonCount, 0)).toBe(2);
    expect(rows.reduce((sum, row) => sum + row.wonAmount, 0)).toBe(300);
  });

  it("does not reveal a foreign author's name or mix amounts in the ranking", async () => {
    const rows = await getSalesRepRankingByTenant("a");
    expect(rows.find(row => row.userId === "seller-a")).toMatchObject({ displayName: "Local Seller", proposedAmount: 200 });
    expect(rows.find(row => row.userId === "seller-b")).toMatchObject({ displayName: "Sin asignar", proposedAmount: 100 });
    expect(JSON.stringify(rows)).not.toContain("Private");
    expect(await getSalesRepRankingByTenant("absent")).toEqual([]);
  });
});
