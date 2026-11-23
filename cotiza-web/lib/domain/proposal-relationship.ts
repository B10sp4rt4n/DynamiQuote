import { z } from "zod";

const mode = z.enum(["unclassified", "revision", "alternatives", "complements"]);
const proposalId = z.string().trim().min(1).max(100);

const fields = {
  mode,
  proposalIds: z.array(proposalId).max(100),
  preferredProposalId: proposalId.nullable(),
};

function validRelationship(value: {
  mode: z.infer<typeof mode>;
  proposalIds: string[];
  preferredProposalId: string | null;
}) {
  if (new Set(value.proposalIds).size !== value.proposalIds.length) return false;
  if (value.mode === "unclassified") return !value.proposalIds.length && value.preferredProposalId === null;
  if (value.proposalIds.length < 2) return false;
  if (value.mode === "complements") return value.preferredProposalId === null;
  if (value.preferredProposalId === null) return value.mode === "alternatives";
  return value.proposalIds.includes(value.preferredProposalId);
}

export const proposalRelationshipInputSchema = z.object({
  ...fields,
  revision: z.number().int().nonnegative(),
}).strict().refine(validRelationship);

const recordSchema = z.object({
  ...fields,
  version: z.literal(1),
  revision: z.number().int().positive(),
  changedAt: z.string(),
  changedBy: z.string(),
}).refine(validRelationship);

export type ProposalRelationshipInput = z.infer<typeof proposalRelationshipInputSchema>;
export type ProposalRelationship = z.infer<typeof recordSchema>;
export type ProposalRelationshipMode = ProposalRelationship["mode"];

export const PROPOSAL_RELATIONSHIP_LABELS: Record<ProposalRelationshipMode, string> = {
  unclassified: "Sin clasificar",
  revision: "Revisiones",
  alternatives: "Alternativas",
  complements: "Complementos",
};

export function isLiveProposal(outcome: string | null, status: string) {
  return outcome === null && !["rejected", "rechazada", "expired", "vencida", "archived"].includes(status.trim().toLowerCase());
}

export function readProposalRelationship(metadata: unknown): ProposalRelationship | null {
  const record = metadata && typeof metadata === "object" && "proposalRelationship" in metadata
    ? metadata.proposalRelationship
    : null;
  const parsed = recordSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export type RelatedProposal = {
  id: string;
  outcome: string | null;
  decidedAt: Date | null;
  active: boolean;
  visible: boolean;
  amount: number | null;
  currency: string | null;
};

export type ProposalRelationshipAmount = { currency: string | null; value: number };
export type ProposalRelationshipSummary = {
  mode: Exclude<ProposalRelationshipMode, "unclassified">;
  amounts: ProposalRelationshipAmount[];
  range: { currency: string; minimum: number; maximum: number } | null;
  pendingChoice: boolean;
  unclassifiedCount: number;
  decisionConflict: boolean;
  reviewRequired: boolean;
};

export function resolveProposalRelationship(
  relationship: ProposalRelationship,
  proposals: RelatedProposal[],
) {
  const classified = proposals.filter(proposal => relationship.proposalIds.includes(proposal.id));
  const active = classified.filter(proposal => proposal.active);
  const winners = proposals.filter(proposal => proposal.outcome === "won");
  const lost = classified.filter(proposal => proposal.outcome === "lost");
  const unclassified = proposals.filter(proposal => !relationship.proposalIds.includes(proposal.id));
  const preferred = classified.find(proposal => proposal.id === relationship.preferredProposalId);
  const complements = relationship.mode === "complements";
  const pendingChoice = relationship.mode === "alternatives" && !preferred?.active && active.length > 0 && winners.length === 0;
  const decisionConflict = winners.length > 1 && (!complements || unclassified.some(proposal => proposal.outcome === "won"));
  const openOffers = complements ? active : preferred?.active ? [preferred] : [];
  const activeBusiness = complements || relationship.mode === "alternatives" ? active.length > 0 : preferred?.active === true;
  const revisionLost = relationship.mode === "revision" && preferred?.outcome === "lost";
  const stage = winners.length ? "won"
    : revisionLost || (!activeBusiness && lost.length > 0 && relationship.mode !== "revision") ? "lost" : "open";
  const decisions = decisionConflict ? [] : stage === "won" ? winners
    : stage === "lost" ? (complements ? lost : preferred?.outcome === "lost" ? [preferred] : [])
    : [];
  const offers = decisionConflict ? [] : stage === "won" ? (complements ? [...winners, ...active] : winners)
    : stage === "lost" ? decisions : openOffers;

  const amounts = new Map<string | null, number>();
  let unresolvedAmount = false;
  for (const proposal of (stage === "open" ? offers : decisions).filter(row => row.visible)) {
    if (proposal.amount === null || (proposal.currency === null && amounts.has(null))) {
      unresolvedAmount = true;
      continue;
    }
    amounts.set(proposal.currency, (amounts.get(proposal.currency) ?? 0) + proposal.amount);
  }
  if (unresolvedAmount) amounts.delete(null);
  const rangeRows = pendingChoice ? active.filter(proposal => proposal.visible) : [];
  const rangeCurrency = rangeRows[0]?.currency;
  const range = rangeCurrency && rangeRows.every(row => row.currency === rangeCurrency && row.amount !== null)
    ? { currency: rangeCurrency, minimum: Math.min(...rangeRows.map(row => row.amount!)), maximum: Math.max(...rangeRows.map(row => row.amount!)) }
    : null;
  const stageRows = stage === "won" ? winners : stage === "lost" ? (revisionLost ? [preferred!] : lost) : [];
  const closedAt = stageRows.length && stageRows.every(row => row.decidedAt)
    ? new Date(Math.min(...stageRows.map(row => row.decidedAt!.getTime()))).toISOString()
    : null;
  return {
    stage,
    closedAt,
    offers,
    decisions,
    summary: {
      mode: relationship.mode as ProposalRelationshipSummary["mode"],
      amounts: Array.from(amounts, ([currency, value]) => ({ currency, value })),
      range: decisionConflict ? null : range,
      pendingChoice,
      unclassifiedCount: unclassified.filter(proposal => proposal.active && proposal.visible).length,
      decisionConflict,
      reviewRequired: decisionConflict || unresolvedAmount || (relationship.mode === "revision" && stage === "open" && !preferred?.active),
    } satisfies ProposalRelationshipSummary,
  } as const;
}
