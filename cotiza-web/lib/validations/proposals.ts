import { z } from "zod";

export const proposalStatusSchema = z.enum([
  "draft",
  "sent",
  "in_review",
  "approved",
  "rejected",
  "expired",
]);

export const proposalImportItemSchema = z.object({
  componentType: z.string().trim().max(120).optional().default(""),
  costUnit: z.number().min(0),
  description: z.string().trim().max(4000).optional().default(""),
  itemNumber: z.number().int().positive(),
  origin: z.string().trim().max(120).optional().default(""),
  priceUnit: z.number().min(0),
  quantity: z.number().positive(),
  sku: z.string().trim().max(120).optional().default(""),
  status: z.string().trim().max(60).optional().default("active"),
});

export const updateProposalWorkflowSchema = z
  .object({
    issuerCompany: z.string().trim().max(200).optional(),
    issuerEmail: z.string().trim().max(200).optional(),
    issuerPhone: z.string().trim().max(80).optional(),
    items: z.array(proposalImportItemSchema).min(1).optional(),
    recipientCompany: z.string().trim().max(200).optional(),
    recipientContactName: z.string().trim().max(200).optional(),
    recipientEmail: z.string().trim().max(200).optional(),
    recipientContactTitle: z.string().trim().max(200).optional(),
    status: proposalStatusSchema.optional(),
    subject: z.string().trim().max(300).optional(),
    termsAndConditions: z.string().trim().max(12000).optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.termsAndConditions !== undefined ||
      value.subject !== undefined ||
      value.issuerCompany !== undefined ||
      value.issuerEmail !== undefined ||
      value.issuerPhone !== undefined ||
      value.recipientCompany !== undefined ||
      value.recipientContactName !== undefined ||
      value.recipientEmail !== undefined ||
      value.recipientContactTitle !== undefined ||
      value.items !== undefined,
    {
      message: "Debes enviar al menos un campo para actualizar",
      path: ["status"],
    },
  );

export const createProposalFromQuoteSchema = z.object({
  quoteId: z.string().min(1),
  recipientCompany: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(300).optional(),
});

export const proposalImportPayloadSchema = z.object({
  items: z.array(proposalImportItemSchema).min(1),
});

export type ProposalStatus = z.infer<typeof proposalStatusSchema>;
export type CreateProposalFromQuoteInput = z.infer<typeof createProposalFromQuoteSchema>;
export type UpdateProposalWorkflowInput = z.infer<typeof updateProposalWorkflowSchema>;
export type ProposalImportItemInput = z.infer<typeof proposalImportItemSchema>;