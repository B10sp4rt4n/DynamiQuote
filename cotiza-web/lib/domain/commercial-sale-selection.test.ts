import { describe, expect, it } from "vitest";
import { selectCommercialSale, type SaleIdentityCandidate, type SaleIdentityLink } from "./commercial-sale-selection";

const scope = { tenantId: "a", allSellers: true };
const link: SaleIdentityLink = {
  quote_id: "q1", lineage_id: "group1", version: 1, client_id: "client", currency: "MXN",
  opportunity_id: "opp1", opportunity_exists: true, opportunity_client_id: "client", won_peer_count: 1,
};
const candidate: SaleIdentityCandidate = { proposal_id: "p1", origin_quote_id: "q1", opportunity_id: "opp1", links: [link] };
describe("unique won deal selection", () => {
  it("selects the unique won proposal using opportunity identity", () => {
    expect(selectCommercialSale(candidate, scope)).toMatchObject({ state: "selected", identity_basis: "opportunity", reason: null });
  });
  it("never substitutes a higher version for the source-selected won version", () => {
    const otherVersion = { ...candidate, proposal_id: "p2", origin_quote_id: "q2", links: [{ ...link, quote_id: "q2", version: 99 }] };
    expect(selectCommercialSale(candidate, scope).sale_ref).toBe(selectCommercialSale(otherVersion, scope).sale_ref);
    expect(selectCommercialSale({ ...otherVersion, links: [{ ...otherVersion.links[0], won_peer_count: 2 }] }, scope).state).toBe("unresolved");
  });
  it.each([0, 2, 3, null])("does not choose arbitrarily with source peer count %s", won_peer_count => {
    expect(selectCommercialSale({ ...candidate, links: [{ ...link, won_peer_count }] }, scope)).toMatchObject({ state: "unresolved", reason: "AMBIGUOUS_WON_SELECTION", sale_ref: null });
  });
  it("preserves independent sales of the same client", () => {
    const second = { ...candidate, opportunity_id: "opp2", links: [{ ...link, lineage_id: "group2", opportunity_id: "opp2" }] };
    expect(selectCommercialSale(candidate, scope).sale_ref).not.toBe(selectCommercialSale(second, scope).sale_ref);
  });
  it("keeps one deal identity even when proposals mention different quote groups", () => {
    const second = { ...candidate, links: [{ ...link, lineage_id: "group2" }] };
    expect(selectCommercialSale(candidate, scope).sale_ref).toBe(selectCommercialSale(second, scope).sale_ref);
  });
  it("namespaces identities per tenant and basis", () => {
    expect(selectCommercialSale(candidate, scope).sale_ref).not.toBe(selectCommercialSale(candidate, { ...scope, tenantId: "b" }).sale_ref);
    const legacy = { ...candidate, opportunity_id: null, links: [{ ...link, lineage_id: "opp1", opportunity_id: null, opportunity_exists: false, opportunity_client_id: null }] };
    expect(selectCommercialSale(legacy, scope)).toMatchObject({ state: "selected", identity_basis: "legacy_quote_lineage" });
    expect(selectCommercialSale(legacy, scope).sale_ref).not.toBe(selectCommercialSale(candidate, scope).sale_ref);
  });
  it("cannot certify uniqueness from a seller's partial view", () => {
    expect(selectCommercialSale(candidate, { ...scope, allSellers: false })).toMatchObject({ state: "unresolved", reason: "SELECTION_SCOPE_NOT_COMPLETE" });
  });
  it.each([
    { ...candidate, links: [] },
    { ...candidate, links: [link, { ...link, currency: "USD" }] },
    { ...candidate, origin_quote_id: "other" },
    { ...candidate, opportunity_id: null },
    { ...candidate, links: [{ ...link, opportunity_exists: false }] },
    { ...candidate, links: [{ ...link, opportunity_client_id: "another-client" }] },
    { ...candidate, links: [{ ...link, lineage_id: null }] },
    { ...candidate, links: [{ ...link, client_id: null }] },
    { ...candidate, links: [{ ...link, currency: null }] },
    { ...candidate, links: [{ ...link, currency: "EUR" }] },
    { ...candidate, links: [{ ...link, version: null }] },
    { ...candidate, links: [{ ...link, version: 0 }] },
    { ...candidate, links: [{ ...link, version: 1.5 }] },
  ])("leaves contradictory or incomplete identity unresolved", value => {
    expect(selectCommercialSale(value, scope)).toMatchObject({ state: "unresolved", sale_ref: null });
  });
  it("does not mutate source candidate or links", () => {
    const frozen = Object.freeze({ ...candidate, links: Object.freeze([Object.freeze({ ...link })]) });
    expect(selectCommercialSale(frozen as unknown as SaleIdentityCandidate, scope).state).toBe("selected");
  });
});
