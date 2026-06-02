export type ProposalListFilter =
  | "all"
  | "blocked_margin"
  | "draft"
  | "sent"
  | "in_review"
  | "approved"
  | "rejected"
  | "expired";

export type ProposalSort = "date_desc" | "date_asc" | "client_asc" | "status_asc";

export const proposalListFilters: ProposalListFilter[] = [
  "all",
  "blocked_margin",
  "draft",
  "sent",
  "in_review",
  "approved",
  "rejected",
  "expired",
];

export const proposalSorts: ProposalSort[] = ["date_desc", "date_asc", "client_asc", "status_asc"];

export function normalizeProposalListFilter(value: string | null | undefined): ProposalListFilter {
  return proposalListFilters.includes(value as ProposalListFilter)
    ? (value as ProposalListFilter)
    : "all";
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