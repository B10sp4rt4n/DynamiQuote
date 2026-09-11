import { z } from "zod";

export const createClientContactSchema = z.object({
  email: z.string().trim().max(200).optional().nullable(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
});

export type CreateClientContactInput = z.infer<typeof createClientContactSchema>;
