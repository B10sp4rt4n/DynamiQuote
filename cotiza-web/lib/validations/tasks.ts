import { z } from "zod";

export const createTaskSchema = z.object({
  clientId: z.string().min(1),
  description: z.string().trim().min(1).max(500),
  dueDate: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1).optional().nullable(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
