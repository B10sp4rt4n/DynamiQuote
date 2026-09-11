import { z } from "zod";

export const createInteractionLogSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  opportunityId: z.string().trim().min(1).optional().nullable(),
});

export type CreateInteractionLogInput = z.infer<typeof createInteractionLogSchema>;
