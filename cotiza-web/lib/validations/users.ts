import { z } from "zod";

const VALID_ROLES = ["user", "admin", "owner"] as const;

export const createManagedUserSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Alias invalido"),
  email: z.string().trim().email("Correo invalido").max(191),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  role: z.enum(VALID_ROLES).optional().default("user"),
  sellerCode: z.string().trim().max(60).optional().nullable(),
  tenantId: z.string().trim().min(1).max(120).optional(),
  userId: z.string().trim().max(191).optional(),
});

export const updateManagedUserSchema = z
  .object({
    active: z.boolean().optional(),
    alias: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .regex(/^[a-zA-Z0-9._-]+$/, "Alias invalido")
      .optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    role: z.enum(VALID_ROLES).optional(),
    sellerCode: z.string().trim().max(60).nullable().optional(),
    tenantId: z.string().trim().min(1).max(120).optional(),
  })
  .refine(
    (payload) =>
      payload.active !== undefined ||
      payload.alias !== undefined ||
      payload.firstName !== undefined ||
      payload.lastName !== undefined ||
      payload.role !== undefined ||
      payload.sellerCode !== undefined ||
      payload.tenantId !== undefined,
    {
      message: "No hay cambios para actualizar",
    },
  );

export type CreateManagedUserInput = z.infer<typeof createManagedUserSchema>;
export type UpdateManagedUserInput = z.infer<typeof updateManagedUserSchema>;
