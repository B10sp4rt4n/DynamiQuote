import { z } from "zod";

export const createQuoteSchema = z.object({
  clientName: z.string().trim().min(1).max(200),
  playbookName: z.string().trim().max(120).optional(),
  proposalName: z.string().trim().max(200).optional(),
  quotedBy: z.string().trim().max(120).optional(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;