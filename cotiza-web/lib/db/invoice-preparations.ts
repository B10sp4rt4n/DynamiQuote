import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { verifyClassification } from "./fiscal-classifications";
import { createProposalInvoiceSchema, type CreateProposalInvoiceInput } from "@/lib/validations/proposal-invoice";
import { validateSatClassifications } from "@/lib/integrations/digestor-fiscal";

const TYPE = "invoice_preparation_saved";
export type InvoicePreparation = {
  actorUserId: string; input: CreateProposalInvoiceInput;
  emitter: { rfc: string; name: string; regimen: string; zip: string };
  missingFields: string[];
};
export function preparationEvent(tenantId: string, proposalId: string, draftId: string, preparation: InvoicePreparation) {
  const payload = JSON.stringify({ version: 1, type: TYPE, tenantId, proposalId, draftId, ...preparation });
  const event_hash = createHash("sha256").update(payload).digest("hex");
  return { event_id: `ipr_${event_hash}`, tenant_id: tenantId, proposal_id: proposalId,
    event_type: TYPE, event_hash, payload, created_at: new Date() };
}

export async function recoverInvoicePreparation(input: { tenantId: string; proposalId: string; draftId: string;
  actorUserId: string; fingerprint: string; emitter: InvoicePreparation["emitter"]; itemNumbers: number[] }) {
  const rows = await prisma.proposal_audit_events.findMany({
    where: { tenant_id: input.tenantId, proposal_id: input.proposalId, event_type: TYPE,
      payload: { contains: JSON.stringify({ draftId: input.draftId }).slice(1, -1) } },
    orderBy: [{ created_at: "desc" }, { event_id: "desc" }], take: 1,
    select: { event_id: true, event_hash: true, payload: true },
  });
  const row = rows[0];
  if (!row?.payload || createHash("sha256").update(row.payload).digest("hex") !== row.event_hash
    || row.event_id !== `ipr_${row.event_hash}`) return null;
  let data;
  try { data = JSON.parse(row.payload); } catch { return null; }
  if (data.version !== 1 || data.type !== TYPE || data.tenantId !== input.tenantId
    || data.proposalId !== input.proposalId || data.draftId !== input.draftId || data.actorUserId !== input.actorUserId
    || !data.emitter || Object.entries(input.emitter).some(([key, value]) => data.emitter[key] !== value)) return null;
  const checked = createProposalInvoiceSchema.safeParse(data.input);
  if (!checked.success || checked.data.itemsFingerprint !== input.fingerprint || !Array.isArray(data.missingFields)
    || data.missingFields.some((field: unknown) => typeof field !== "string")) return null;
  const saved = checked.data, numbers = saved.fiscalItems.map(item => item.itemNumber);
  if (numbers.length !== input.itemNumbers.length || new Set(numbers).size !== numbers.length
    || input.itemNumbers.some(number => !numbers.includes(number))) return null;
  const versions = [...new Set(saved.fiscalItems.map(item => item.catalogVersion))];
  if (versions.length !== 1) return null;
  const validation = await validateSatClassifications(saved.fiscalItems, versions[0]);
  if (!validation.valid || validation.catalog?.sourceSha256 !== versions[0]) return null;
  for (const item of saved.fiscalItems) {
    const result = validation.items?.find(row => row.itemNumber === item.itemNumber);
    if (!result?.valid || !result.product?.valid || !result.unit?.valid || result.product.code !== item.satProductCode
      || result.unit.code !== item.unitCode || !await verifyClassification({ tenantId: input.tenantId,
        actorUserId: input.actorUserId, proposalId: input.proposalId, fingerprint: input.fingerprint,
        ...item, eventId: item.classificationEventId })) return null;
  }
  return { input: saved, missingFields: data.missingFields as string[] };
}
