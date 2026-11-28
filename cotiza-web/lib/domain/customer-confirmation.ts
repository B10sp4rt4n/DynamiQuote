import { z } from "zod";

export const CUSTOMER_CONFIRMATION_CHANNELS = {
  email: "Correo de confirmación",
  whatsapp: "Conversación de WhatsApp",
  purchase_order: "Orden de compra",
  signed_document: "Propuesta o contrato firmado",
  other: "Otra evidencia escrita",
  verbal: "Solo confirmación verbal, pendiente de respaldo escrito",
} as const;

export const customerConfirmationSchema = z.object({
  channel: z.enum(["email", "whatsapp", "purchase_order", "signed_document", "other", "verbal"]),
  confirmedBy: z.string().trim().min(2, "Indica quién confirmó por parte del cliente").max(200),
  contact: z.string().trim().max(300),
}).strict();
export type CustomerConfirmationInput = z.infer<typeof customerConfirmationSchema>;
export const customerEvidenceAttachmentSchema = z.object({
  id: z.uuid(), filename: z.string().min(1).max(200), mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "message/rfc822"]), sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type CustomerEvidenceAttachment = z.infer<typeof customerEvidenceAttachmentSchema>;
export const customerConfirmationRecordSchema = customerConfirmationSchema.extend({ attachment: customerEvidenceAttachmentSchema.optional() });
export type CustomerConfirmation = z.infer<typeof customerConfirmationRecordSchema>;

export function hasWrittenCustomerEvidence(evidence: string, confirmation?: CustomerConfirmation) {
  return Boolean(confirmation && confirmation.channel !== "verbal"
    && (evidence.trim().length >= 3 || confirmation.attachment));
}

export function isCustomerEvidencePending(value: {
  acceptanceEvidence: string; customerConfirmation?: CustomerConfirmation; customerEvidenceRequired?: boolean;
}) {
  return value.customerEvidenceRequired === true && !hasWrittenCustomerEvidence(value.acceptanceEvidence, value.customerConfirmation);
}
