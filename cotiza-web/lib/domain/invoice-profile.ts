import { createHash } from "node:crypto";

type InvoiceBasis = {
  proposalId: string;
  formal: { currency: string | null } | null;
  items: Array<{ itemNumber: number; description: string; quantity: number; priceUnit: number }>;
};

export function invoiceBasisFingerprint(proposal: InvoiceBasis): string {
  return createHash("sha256").update(JSON.stringify({
    proposalId: proposal.proposalId, currency: proposal.formal?.currency,
    items: proposal.items.map(item => [item.itemNumber, item.description, item.quantity, item.priceUnit]),
  })).digest("hex");
}
