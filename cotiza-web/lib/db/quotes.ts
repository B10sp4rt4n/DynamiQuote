import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

type QuoteSummaryRow = {
  quote_group_id: string | null;
  quote_id: string;
  version: number | null;
  version_count: bigint;
  created_at: Date | null;
  status: string | null;
  total_revenue: Prisma.Decimal | null;
  avg_margin: Prisma.Decimal | null;
  client_name: string | null;
  proposal_name: string | null;
  playbook_name: string | null;
};

type RecentQuoteRow = {
  quote_id: string;
  quote_group_id: string | null;
  version: number | null;
  created_at: Date | null;
  status: string | null;
  total_revenue: Prisma.Decimal | null;
  avg_margin: Prisma.Decimal | null;
  client_name: string | null;
  proposal_name: string | null;
  quoted_by: string | null;
};

export type QuoteGroupSummary = {
  avgMargin: number | null;
  clientName: string;
  createdAt: string | null;
  playbookName: string | null;
  proposalName: string;
  quoteGroupId: string;
  quoteId: string;
  status: string;
  totalRevenue: number | null;
  version: number;
  versionCount: number;
};

export type RecentQuote = {
  avgMargin: number | null;
  clientName: string;
  createdAt: string | null;
  proposalName: string;
  quoteGroupId: string;
  quoteId: string;
  quotedBy: string;
  status: string;
  totalRevenue: number | null;
  version: number;
};

export type QuoteDashboardSnapshot = {
  activeQuoteCount: number;
  recentQuotes: RecentQuote[];
  totalRevenue: number;
};

export type CreateQuoteInput = {
  clientName: string;
  playbookName?: string;
  proposalName?: string;
  quotedBy?: string;
};

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value ? value.toNumber() : null;
}

function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function nextQuoteGroupId(tenantId: string): Promise<string> {
  const rows = await prisma.quote.findMany({
    select: { quote_group_id: true },
    where: {
      quote_group_id: {
        startsWith: "COT-",
      },
      tenantId,
    },
  });

  const lastNumber = rows.reduce((max, row) => {
    const current = Number.parseInt(row.quote_group_id?.replace("COT-", "") ?? "0", 10);
    return Number.isFinite(current) ? Math.max(max, current) : max;
  }, 0);

  return `COT-${String(lastNumber + 1).padStart(4, "0")}`;
}

export async function createQuoteForTenant(
  tenantId: string,
  input: CreateQuoteInput,
): Promise<QuoteGroupSummary> {
  const quoteGroupId = await nextQuoteGroupId(tenantId);
  const quoteId = randomUUID();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.quote.create({
      data: {
        avg_margin: 0,
        client_name: input.clientName,
        createdAt: now,
        gross_profit: 0,
        playbook_name: input.playbookName?.trim() || "General",
        proposal_name: input.proposalName?.trim() || "Sin propuesta",
        quote_group_id: quoteGroupId,
        quote_id: quoteId,
        quoted_by: input.quotedBy?.trim() || null,
        status: "draft",
        tenantId,
        total_cost: 0,
        total_revenue: 0,
        version: 1,
      },
    });

    await tx.quote_lines.create({
      data: {
        cost_unit: 0,
        created_at: now,
        description_final: "",
        description_original: "",
        final_price_unit: 0,
        import_source: "manual",
        line_id: randomUUID(),
        line_type: "product",
        margin_pct: 0,
        quantity: 1,
        quote_id: quoteId,
        service_origin: null,
        sku: null,
      },
    });
  });

  return {
    avgMargin: 0,
    clientName: input.clientName,
    createdAt: now.toISOString(),
    playbookName: input.playbookName?.trim() || "General",
    proposalName: input.proposalName?.trim() || "Sin propuesta",
    quoteGroupId,
    quoteId,
    status: "draft",
    totalRevenue: 0,
    version: 1,
    versionCount: 1,
  };
}

export async function getQuoteGroupsSummaryByTenant(
  tenantId: string,
  limit = 12,
): Promise<QuoteGroupSummary[]> {
  const rows = await prisma.$queryRaw<QuoteSummaryRow[]>(Prisma.sql`
    WITH latest_versions AS (
      SELECT DISTINCT ON (quote_group_id)
        quote_group_id,
        quote_id,
        version,
        created_at,
        status,
        total_revenue,
        avg_margin,
        client_name,
        proposal_name,
        playbook_name
      FROM quotes
      WHERE tenant_id = ${tenantId}
      ORDER BY quote_group_id, version DESC
    ),
    version_counts AS (
      SELECT quote_group_id, COUNT(*) AS version_count
      FROM quotes
      WHERE tenant_id = ${tenantId}
      GROUP BY quote_group_id
    )
    SELECT
      lv.quote_group_id,
      lv.quote_id,
      lv.version,
      vc.version_count,
      lv.created_at,
      lv.status,
      lv.total_revenue,
      lv.avg_margin,
      lv.client_name,
      lv.proposal_name,
      lv.playbook_name
    FROM latest_versions lv
    JOIN version_counts vc ON lv.quote_group_id = vc.quote_group_id
    ORDER BY lv.created_at DESC NULLS LAST
    LIMIT ${limit}
  `);

  return rows
    .filter((row) => row.quote_group_id)
    .map((row) => ({
      avgMargin: decimalToNumber(row.avg_margin),
      clientName: row.client_name ?? "Sin cliente",
      createdAt: dateToIso(row.created_at),
      playbookName: row.playbook_name,
      proposalName: row.proposal_name ?? "Sin propuesta",
      quoteGroupId: row.quote_group_id ?? row.quote_id,
      quoteId: row.quote_id,
      status: row.status ?? "draft",
      totalRevenue: decimalToNumber(row.total_revenue),
      version: row.version ?? 1,
      versionCount: Number(row.version_count),
    }));
}

export async function getQuoteDashboardSnapshotByTenant(
  tenantId: string,
): Promise<QuoteDashboardSnapshot> {
  const [aggregate, recentRows] = await Promise.all([
    prisma.quote.aggregate({
      _count: {
        quote_id: true,
      },
      _sum: {
        total_revenue: true,
      },
      where: {
        tenantId,
      },
    }),
    prisma.$queryRaw<RecentQuoteRow[]>(Prisma.sql`
      SELECT q.quote_id, q.quote_group_id, q.version, q.created_at, q.status,
             q.total_revenue, q.avg_margin, q.client_name, q.proposal_name, q.quoted_by
      FROM quotes q
      INNER JOIN (
        SELECT quote_group_id, MAX(version) AS max_version
        FROM quotes
        WHERE tenant_id = ${tenantId}
        GROUP BY quote_group_id
      ) latest ON q.quote_group_id = latest.quote_group_id AND q.version = latest.max_version
      WHERE q.tenant_id = ${tenantId}
      ORDER BY q.created_at DESC NULLS LAST
      LIMIT 6
    `),
  ]);

  return {
    activeQuoteCount: aggregate._count.quote_id,
    recentQuotes: recentRows
      .filter((row) => row.quote_group_id)
      .map((row) => ({
        avgMargin: decimalToNumber(row.avg_margin),
        clientName: row.client_name ?? "Sin cliente",
        createdAt: dateToIso(row.created_at),
        proposalName: row.proposal_name ?? "Sin propuesta",
        quoteGroupId: row.quote_group_id ?? row.quote_id,
        quoteId: row.quote_id,
        quotedBy: row.quoted_by ?? "Sin asignar",
        status: row.status ?? "draft",
        totalRevenue: decimalToNumber(row.total_revenue),
        version: row.version ?? 1,
      })),
    totalRevenue: decimalToNumber(aggregate._sum.total_revenue) ?? 0,
  };
}