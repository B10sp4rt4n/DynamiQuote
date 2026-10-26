import { createHash } from "node:crypto";

/** Conservative source rule, not a claim that a transaction was paid/invoiced.
 * Opportunities are deal identities; quote groups identify their revisions.
 * Legacy records without opportunity can use an explicit quote group only.
 */
export const SALE_SELECTION_RULE = "cotiza-unique-won-deal/0.1";
export type SaleIdentityLink = {
  quote_id: string | null;
  lineage_id: string | null;
  version: number | null;
  client_id: string | null;
  currency: string | null;
  opportunity_id: string | null;
  opportunity_exists: boolean;
  opportunity_client_id: string | null;
  won_peer_count: number | null;
};
export type SaleIdentityCandidate = {
  proposal_id: string;
  origin_quote_id: string | null;
  opportunity_id: string | null;
  links: SaleIdentityLink[];
};

export function selectCommercialSale(
  candidate: SaleIdentityCandidate,
  scope: { tenantId: string; allSellers: boolean },
) {
  const unresolved = (reason: string) => ({
    state: "unresolved" as const, sale_ref: null, identity_basis: null,
    rule_id: SALE_SELECTION_RULE, reason,
  });
  // A seller's view cannot prove that no other seller owns another won
  // revision. Do not inspect hidden peers or leak their existence/counts.
  if (!scope.allSellers) return unresolved("SELECTION_SCOPE_NOT_COMPLETE");
  if (candidate.links.length !== 1) return unresolved("AMBIGUOUS_DOCUMENT_LINK");
  const link = candidate.links[0];
  if (!link.quote_id || candidate.origin_quote_id !== link.quote_id) return unresolved("ORIGIN_LINK_MISMATCH");
  if (!link.lineage_id || !Number.isInteger(link.version) || link.version! < 1 ||
      !link.client_id || !["MXN", "USD"].includes(link.currency ?? "")) return unresolved("INCOMPLETE_SALE_IDENTITY");
  if (candidate.opportunity_id !== link.opportunity_id) return unresolved("OPPORTUNITY_LINK_MISMATCH");
  if (link.opportunity_id && (!link.opportunity_exists ||
      (link.opportunity_client_id !== null && link.opportunity_client_id !== link.client_id))) {
    return unresolved("INVALID_OPPORTUNITY_RELATION");
  }
  if (link.won_peer_count !== 1) return unresolved("AMBIGUOUS_WON_SELECTION");
  const identityBasis = link.opportunity_id ? "opportunity" : "legacy_quote_lineage";
  const identity = link.opportunity_id ?? link.lineage_id;
  return {
    state: "selected" as const,
    sale_ref: `sale:${createHash("sha256").update(JSON.stringify([scope.tenantId, identityBasis, identity])).digest("hex")}`,
    identity_basis: identityBasis,
    rule_id: SALE_SELECTION_RULE,
    reason: null,
  };
}
