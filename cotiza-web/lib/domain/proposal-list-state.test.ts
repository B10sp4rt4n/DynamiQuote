import { describe, expect, it } from "vitest";

import {
  normalizeProposalListFilter,
  normalizeProposalSort,
  resolveSelectedProposalId,
} from "@/lib/domain/proposal-list-state";

describe("proposal-list-state", () => {
  it("normaliza filtros invalidos a all", () => {
    expect(normalizeProposalListFilter("sent")).toBe("sent");
    expect(normalizeProposalListFilter("foo")).toBe("all");
    expect(normalizeProposalListFilter(null)).toBe("all");
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