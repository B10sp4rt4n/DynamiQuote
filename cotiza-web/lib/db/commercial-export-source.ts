import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SaleIdentityLink } from "@/lib/domain/commercial-sale-selection";

export type CommercialExportScope = {
  tenantId: string;
  userId: string;
  allSellers: boolean;
  includeCosts: boolean;
};

export type CommercialSourceRow = {
  proposal_id: string;
  tenant_id: string;
  seller_id: string | null;
  origin_quote_id: string | null;
  opportunity_id: string | null;
  outcome_at: Date | null;
  reporting_at: Date | null;
  legacy_act_ref: string | null;
  revenue: string | null;
  cost: string | null;
  links: SaleIdentityLink[];
};

/** One parameterized SELECT; no writes, client contacts, XML, or credentials.
 * The bound scope must come from server authentication, never a chat payload.
 * Missing owners are intentionally excluded from seller-only exports.
 */
export async function readCommercialExportRows(
  scope: CommercialExportScope, start: Date, end: Date,
): Promise<CommercialSourceRow[]> {
  const sellerFilter = scope.allSellers ? Prisma.empty
    : Prisma.sql`AND p.created_by_user_id = ${scope.userId}`;
  // Do not fetch cost at all for a reader without financial permission.
  const cost = scope.includeCosts
    ? Prisma.sql`CASE WHEN COUNT(*) > 0 AND COUNT(i.subtotal_cost) = COUNT(*)
        THEN SUM(i.subtotal_cost)::text END`
    : Prisma.sql`NULL::text`;
  // Scope closure must be assessed BEFORE the requested reporting period.
  // Only tenant-wide readers can see/count peers. Seller queries do neither.
  const wonPeerCount = scope.allSellers ? Prisma.sql`(
    SELECT COUNT(DISTINCT w.proposal_id)::int FROM proposals w
    WHERE w.tenant_id = p.tenant_id AND w.outcome = 'won' AND (
      (p.opportunity_id IS NOT NULL AND w.opportunity_id = p.opportunity_id)
      OR (q.opportunity_id IS NOT NULL AND w.opportunity_id = q.opportunity_id)
      OR EXISTS (
        SELECT 1 FROM quotes wq
        WHERE wq.tenant_id = p.tenant_id AND (
          (q.quote_group_id IS NOT NULL AND wq.quote_group_id = q.quote_group_id)
          OR (p.opportunity_id IS NOT NULL AND wq.opportunity_id = p.opportunity_id)
          OR (q.opportunity_id IS NOT NULL AND wq.opportunity_id = q.opportunity_id)
        ) AND (w.origin = wq.quote_id OR EXISTS (
          SELECT 1 FROM formal_proposals wf WHERE wf.tenant_id = p.tenant_id
            AND wf.proposal_id = w.proposal_id AND wf.quote_id = wq.quote_id
        ))
      )
    )
  )` : Prisma.sql`NULL::int`;
  return prisma.$queryRaw<CommercialSourceRow[]>(Prisma.sql`
    WITH scoped AS (
      SELECT p.proposal_id, p.tenant_id, p.created_by_user_id AS seller_id,
        p.outcome_at, p.origin AS origin_quote_id, p.opportunity_id,
        COALESCE(p.outcome_at, CASE WHEN legacy.event_id IS NOT NULL THEN p.created_at END) AS reporting_at,
        CASE WHEN p.outcome_at IS NULL THEN legacy.event_id END AS legacy_act_ref
      FROM proposals p
      LEFT JOIN proposal_audit_events legacy
        ON legacy.tenant_id = p.tenant_id AND legacy.proposal_id = p.proposal_id
        AND legacy.event_id = 'legacy-creation-20261021:' || p.proposal_id
        AND legacy.event_type = 'historical_creation_reference'
      WHERE p.tenant_id = ${scope.tenantId} AND p.outcome = 'won'
        ${sellerFilter}
    )
    SELECT p.*, amounts.revenue, amounts.cost, COALESCE(refs.links, '[]'::jsonb) AS links
    FROM scoped p
    LEFT JOIN LATERAL (
      SELECT CASE WHEN COUNT(*) > 0 AND COUNT(i.subtotal_price) = COUNT(*)
          THEN SUM(i.subtotal_price)::text END AS revenue, ${cost} AS cost
      FROM proposal_items i
      WHERE i.tenant_id = p.tenant_id AND i.proposal_id = p.proposal_id AND i.status != 'deleted'
    ) amounts ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'quote_id', q.quote_id, 'lineage_id', q.quote_group_id, 'version', q.version,
        'client_id', c.client_id, 'currency', f.currency,
        'opportunity_id', q.opportunity_id, 'opportunity_exists', o.opportunity_id IS NOT NULL,
        'opportunity_client_id', o.client_id, 'won_peer_count', ${wonPeerCount})) AS links
      FROM formal_proposals f
      LEFT JOIN quotes q ON q.quote_id = f.quote_id AND q.tenant_id = p.tenant_id
      LEFT JOIN clients c ON c.client_id = q.client_id AND c.tenant_id = p.tenant_id
      LEFT JOIN opportunities o ON o.opportunity_id = q.opportunity_id AND o.tenant_id = p.tenant_id
      WHERE f.proposal_id = p.proposal_id AND f.tenant_id = p.tenant_id
    ) refs ON true
    WHERE p.reporting_at IS NULL OR (p.reporting_at >= ${start} AND p.reporting_at < ${end})
    ORDER BY p.proposal_id
    LIMIT 501
  `);
}
