import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getCurrentTenantContext, type TenantContext } from "@/lib/auth/tenant-context";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { readCommercialExportRows, type CommercialSourceRow } from "@/lib/db/commercial-export-source";
import { selectCommercialSale } from "@/lib/domain/commercial-sale-selection";

// Deliberately no endpoint, capability setter, scheduled job, or runtime caller.
export const COMMERCIAL_EXPORT_READ = "commercial_chat_read";
type Request = { startUtc: string; endUtcExclusive: string };
type Grant = { tenantId: string; userId: string; allSellers: boolean; includeCosts: boolean };

async function resolveGrant(): Promise<Grant | null> {
  const ctx: TenantContext | null = await getCurrentTenantContext();
  if (!ctx?.userId || ctx.authMode !== "clerk" ||
      !await isTenantCapabilityEnabled(ctx.id, COMMERCIAL_EXPORT_READ)) return null;
  const privileged = ctx.isSuperAdmin || ctx.userRole === "owner" || ctx.userRole === "admin";
  return { tenantId: ctx.id, userId: ctx.userId, allSellers: privileged, includeCosts: privileged };
}

function boundary(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
}

function money(value: string | null): string | null {
  if (value === null) return null;
  // Source numerics remain decimal throughout. Never accept floats or silently
  // round sub-cent values from a different financial rule.
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error("INVALID_SOURCE");
  const amount = new Prisma.Decimal(value);
  if (amount.decimalPlaces() > 2) throw new Error("INVALID_SOURCE");
  return amount.isZero() ? "0.00" : amount.toFixed(2);
}

function project(row: CommercialSourceRow, grant: Grant) {
  if (row.tenant_id !== grant.tenantId || (!grant.allSellers && row.seller_id !== grant.userId)) {
    throw new Error("INVALID_SOURCE");
  }
  const links = [...row.links].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const revenue = money(row.revenue);
  const cost = grant.includeCosts ? money(row.cost) : null;
  const issues: string[] = [];
  if (!row.reporting_at) issues.push("MISSING_CLOSE_DATE");
  if (revenue === null) issues.push("MISSING_REVENUE");
  if (grant.includeCosts && cost === null) issues.push("MISSING_COST");
  if (links.length !== 1 || !links[0].quote_id || !links[0].lineage_id ||
      !links[0].version || !links[0].client_id || !["MXN", "USD"].includes(links[0].currency ?? "")) {
    issues.push("UNRESOLVED_SOURCE_LINK");
  }
  return {
    proposal_id: row.proposal_id, seller_id: row.seller_id,
    origin_quote_id: row.origin_quote_id, opportunity_id: row.opportunity_id,
    sale_selection: selectCommercialSale(row, grant),
    outcome_at: row.outcome_at?.toISOString() ?? null,
    reporting_at: row.reporting_at?.toISOString() ?? null,
    date_basis: row.outcome_at ? "recorded_close" : row.legacy_act_ref ? "legacy_creation_reference" : "unknown",
    legacy_act_ref: row.legacy_act_ref, revenue_before_vat: revenue, cost,
    gross_profit: revenue !== null && cost !== null
      ? new Prisma.Decimal(revenue).minus(cost).toFixed(2) : null,
    links, issues,
  };
}

/** Internal preparation API. Authentication is resolved again on every call
 * and after reading. It exports candidates, NOT a deduplicated sales ranking.
 * No user-supplied tenant, scope, cost permission, SQL, or historical as_of.
 */
export async function prepareCommercialProposalExport(request: Request) {
  const grant = await resolveGrant();
  if (!grant) return { status: "forbidden" as const };
  if (!request || Object.keys(request).sort().join(",") !== "endUtcExclusive,startUtc") {
    return { status: "invalid_request" as const };
  }
  const start = boundary(request.startUtc), end = boundary(request.endUtcExclusive);
  if (!start || !end || start >= end) return { status: "invalid_request" as const };
  const observedAt = new Date().toISOString();
  let rows: CommercialSourceRow[];
  try {
    rows = await readCommercialExportRows(grant, start, end);
  } catch {
    return { status: "source_unavailable" as const };
  }
  const current = await resolveGrant();
  if (!current || JSON.stringify(current) !== JSON.stringify(grant)) return { status: "forbidden" as const };
  if (rows.length > 500) return { status: "limit_exceeded" as const };
  try {
    const records = rows.map(row => project(row, grant)).sort((a, b) => a.proposal_id.localeCompare(b.proposal_id));
    if (new Set(records.map(row => row.proposal_id)).size !== records.length) throw new Error("INVALID_SOURCE");
    const selected = records.filter(row => row.sale_selection.state === "selected");
    if (new Set(selected.map(row => row.sale_selection.sale_ref)).size !== selected.length) throw new Error("INVALID_SOURCE");
    // Unique source selection is separate from date/amount eligibility.
    // Returning candidates never certifies completeness or ranking totals.
    const payload = {
      format: "cotiza-proposal-export/0.2" as const,
      observed_at: observedAt, period: { start_utc: request.startUtc, end_utc_exclusive: request.endUtcExclusive },
      scope: grant, basis: "proposal_items.subtotal_price/cost" as const,
      selection: "unique_won_deal_or_unresolved" as const,
      coverage: "not_certified" as const, records,
      provenance: { integrity: "integrity_only", custody: "local_only", source_authentication: "not_attested" },
    };
    return { status: "prepared" as const, payload,
      digest: { profile: "json-stringify-utf8/v1", sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") } };
  } catch {
    return { status: "invalid_source" as const };
  }
}
