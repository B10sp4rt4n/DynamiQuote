import { z } from "zod";
import { isSatisfied, type WinCase } from "./won-consolidation";
import { customerConfirmationRecordSchema } from "./customer-confirmation";

export const procurementBasisSchema = z.object({
  schemaVersion: z.literal(1), tenantId: z.string().min(1), proposalId: z.string().min(1),
  proposalNumber: z.string().min(1), formalDocId: z.string().min(1), quoteId: z.string().nullable(),
  opportunityId: z.string().nullable(), customer: z.string().min(1), subject: z.string(),
  currency: z.enum(["MXN", "USD", "EUR"]), terms: z.string(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), winRevision: z.number().int().positive(), policyRevision: z.number().int().nonnegative(),
  acceptedAt: z.iso.datetime(), consolidatedAt: z.iso.datetime(), acceptedBy: z.string().min(1), acceptanceEvidence: z.string(),
  customerConfirmation: customerConfirmationRecordSchema.optional(),
  approvals: z.array(z.object({ ruleId: z.string(), label: z.string(), decision: z.enum(["approved", "waived"]),
    actorId: z.string(), actorRole: z.string(), recordedAt: z.iso.datetime(), evidence: z.string() }).strict()).max(20),
  items: z.array(z.object({ itemId: z.string().min(1), itemNumber: z.number().int().positive(), sku: z.string().nullable(),
    description: z.string().trim().min(1).max(4000), quantity: z.number().finite().positive().max(1e9),
    costUnit: z.number().finite().nonnegative().max(1e12), subtotalCost: z.number().finite().nonnegative().max(1e15),
    componentType: z.string().nullable(), origin: z.string().nullable() }).strict()).min(1).max(500),
}).strict();
export type ProcurementBasis = z.infer<typeof procurementBasisSchema>;
export type ProcurementDraft = {
  id: string; tenantId: string; proposalId: string; folio: string; closureKey: string; sourceHash: string;
  revision: number; state: "draft" | "review_required"; reason: string | null; basis: ProcurementBasis;
  notes: string; neededOn: string | null; createdAt: string; createdBy: string;
};
export type ProcurementView = {
  tenantId: string; proposalId: string; enabled: boolean; canPrepare: boolean; reason: string | null;
  winRevision: number | null; fingerprint: string | null; drafts: Array<ProcurementDraft & { current: boolean }>;
};
export const procurementActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), expectedWinRevision: z.number().int().positive(),
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("update"), draftId: z.string().uuid(), expectedRevision: z.number().int().positive(),
    notes: z.string().trim().max(4000), neededOn: z.iso.date().nullable() }).strict(),
]);
export type ProcurementAction = z.infer<typeof procurementActionSchema>;

export function procurementEligibility(current: WinCase | null, outcome: string | null, status: string, fingerprint: string): string | null {
  if (!current) return "Esta propuesta necesita un cierre con sus validaciones registradas antes de preparar Compras.";
  if (current.cancelledAt || outcome !== "won" || !current.consolidatedAt) return "Completa primero la consolidación de ganada y sus autorizaciones.";
  if (status !== "approved" || current.fingerprint !== fingerprint) return "La propuesta cambió. Revisa la aceptación y las autorizaciones antes de preparar Compras.";
  if (!current.rules.every(rule => isSatisfied(current.decisions[rule.id]))) return "Faltan autorizaciones del cierre.";
  return null;
}
export function validateProcurementBasis(value: unknown): ProcurementBasis {
  const result = procurementBasisSchema.safeParse(value);
  if (!result.success) throw Error("Revisa la moneda, descripción, cantidades y costos de las partidas antes de preparar Compras.");
  const basis = result.data;
  if (new Set(basis.items.map(item => item.itemId)).size !== basis.items.length) throw Error("Hay partidas repetidas en el cierre.");
  for (const item of basis.items) {
    if (Math.abs(Math.round(item.quantity * item.costUnit * 100) / 100 - item.subtotalCost) > 0.011) {
      throw Error("El costo de una partida no concuerda con su cantidad. Revisa la propuesta.");
    }
  }
  return basis;
}
