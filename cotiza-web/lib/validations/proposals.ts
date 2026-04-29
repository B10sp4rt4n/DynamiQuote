import { z } from "zod";

export const proposalStatusSchema = z.enum([
  "draft",
  "sent",
  "in_review",
  "approved",
  "rejected",
  "expired",
]);

export const updateProposalWorkflowSchema = z
  .object({
    status: proposalStatusSchema.optional(),
    termsAndConditions: z.string().trim().max(12000).optional(),
  })
  .refine((value) => value.status !== undefined || value.termsAndConditions !== undefined, {
    message: "Debes enviar status o termsAndConditions",
    path: ["status"],
  });

export const createProposalFromQuoteSchema = z.object({
  quoteId: z.string().min(1),
  recipientCompany: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(300).optional(),
});

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

export const proposalImportPayloadSchema = z.object({
  items: z.array(proposalImportItemSchema).min(1),
});

export type ProposalStatus = z.infer<typeof proposalStatusSchema>;
export type CreateProposalFromQuoteInput = z.infer<typeof createProposalFromQuoteSchema>;
export type UpdateProposalWorkflowInput = z.infer<typeof updateProposalWorkflowSchema>;
export type ProposalImportItemInput = z.infer<typeof proposalImportItemSchema>;