import { z } from "zod";

export const createQuoteSchema = z.object({
  clientId: z.string().trim().max(100).optional().nullable(),
  clientName: z.string().trim().min(1).max(200),
  playbookName: z.string().trim().max(120).optional(),
  proposalName: z.string().trim().max(200).optional(),
  quotedBy: z.string().trim().max(120).optional(),
  creationId: z.uuid().optional(),
  opportunityMode: z.enum(["new", "existing"]).optional(),
  opportunityId: z.string().trim().min(1).max(100).optional(),
}).superRefine((input, ctx) => {
  if (input.opportunityMode === "existing" && (!input.opportunityId || !input.clientId)) {
    ctx.addIssue({ code: "custom", message: "Selecciona cliente y oportunidad existente", path: ["opportunityId"] });
  }
  if (input.opportunityMode !== "existing" && input.opportunityId) {
    ctx.addIssue({ code: "custom", message: "La nueva oportunidad no puede incluir un ID existente", path: ["opportunityId"] });
  }
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const quoteActionSchema = z.object({
  action: z.enum(["send", "close", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

export type QuoteActionInput = z.infer<typeof quoteActionSchema>;
