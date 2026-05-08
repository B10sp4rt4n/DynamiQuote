import { z } from "zod";

const VALID_ROLES = ["user", "admin", "owner"] as const;

export const createManagedUserSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Alias invalido"),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  role: z.enum(VALID_ROLES).optional().default("user"),
  sellerCode: z.string().trim().max(60).optional().nullable(),
  tenantId: z.string().trim().min(1).max(120).optional(),
  userId: z.string().trim().max(191).optional(),
});

export type CreateManagedUserInput = z.infer<typeof createManagedUserSchema>;
