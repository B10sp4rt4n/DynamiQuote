import type { ProposalStatus } from "@/lib/validations/proposals";

// Reemplaza al antiguo ProposalListFilter (un solo valor mutuamente
// excluyente) -- ver CLAUDE.md 2026-10-20, "esta parte es un caos... ver si
// se puede... adentro poder seleccionar cada status". Estatus, Riesgo
// (margen) y Desenlace son ejes independientes de una propuesta (una
// aprobada puede a la vez estar ganada, por ejemplo), asi que ahora se
// combinan con AND en vez de competir por el mismo valor.
export type ProposalStatusFilter = "all" | ProposalStatus;
export type ProposalOutcomeFilter = "all" | "won" | "lost" | "discarded";

export type ProposalSort = "date_desc" | "date_asc" | "client_asc" | "status_asc";

export const proposalStatusFilters: ProposalStatusFilter[] = [
  "all",
  "draft",
  "sent",
  "in_review",
  "approved",
  "rejected",
  "expired",
];

export const proposalOutcomeFilters: ProposalOutcomeFilter[] = ["all", "won", "lost", "discarded"];

export const proposalSorts: ProposalSort[] = ["date_desc", "date_asc", "client_asc", "status_asc"];

export function normalizeProposalStatusFilter(value: string | null | undefined): ProposalStatusFilter {
  return proposalStatusFilters.includes(value as ProposalStatusFilter)
    ? (value as ProposalStatusFilter)
    : "all";
}

export function normalizeProposalOutcomeFilter(value: string | null | undefined): ProposalOutcomeFilter {
  return proposalOutcomeFilters.includes(value as ProposalOutcomeFilter)
    ? (value as ProposalOutcomeFilter)
    : "all";
}

export function normalizeBlockedMarginFilter(value: string | null | undefined): boolean {
  return value === "1";
}

export function normalizeProposalSort(value: string | null | undefined): ProposalSort {
  return proposalSorts.includes(value as ProposalSort) ? (value as ProposalSort) : "date_desc";
}

export function resolveSelectedProposalId<T extends { proposalId: string }>(
  items: T[],
  proposalId: string | null | undefined,
): string | null {
  if (proposalId && items.some((item) => item.proposalId === proposalId)) {
    return proposalId;
  }

  return items[0]?.proposalId ?? null;
}
