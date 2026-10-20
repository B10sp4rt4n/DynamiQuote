import { describe, expect, it } from "vitest";

import {
  normalizeBlockedMarginFilter,
  normalizeProposalOutcomeFilter,
  normalizeProposalSort,
  normalizeProposalStatusFilter,
  resolveSelectedProposalId,
} from "@/lib/domain/proposal-list-state";

describe("proposal-list-state", () => {
  it("normaliza filtro de estatus invalido a all", () => {
    expect(normalizeProposalStatusFilter("sent")).toBe("sent");
    expect(normalizeProposalStatusFilter("foo")).toBe("all");
    expect(normalizeProposalStatusFilter(null)).toBe("all");
  });

  it("normaliza filtro de desenlace invalido a all", () => {
    expect(normalizeProposalOutcomeFilter("won")).toBe("won");
    expect(normalizeProposalOutcomeFilter("approved")).toBe("all");
    expect(normalizeProposalOutcomeFilter(null)).toBe("all");
  });

  it("normaliza el flag de bloqueadas por margen -- solo '1' activa", () => {
    expect(normalizeBlockedMarginFilter("1")).toBe(true);
    expect(normalizeBlockedMarginFilter("true")).toBe(false);
    expect(normalizeBlockedMarginFilter(null)).toBe(false);
  });

  it("normaliza orden invalido a date_desc", () => {
    expect(normalizeProposalSort("client_asc")).toBe("client_asc");
    expect(normalizeProposalSort("weird")).toBe("date_desc");
  });

  it("resuelve proposalId solo si existe y si no usa el primero", () => {
    const items = [{ proposalId: "p-2" }, { proposalId: "p-3" }];

    expect(resolveSelectedProposalId(items, "p-3")).toBe("p-3");
    expect(resolveSelectedProposalId(items, "missing")).toBe("p-2");
    expect(resolveSelectedProposalId([], "missing")).toBeNull();
  });
});