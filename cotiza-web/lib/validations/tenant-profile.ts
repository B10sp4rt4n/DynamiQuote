import { z } from "zod";

export const updateTenantProfileSchema = z
  .object({
    address: z.string().trim().max(300).optional().nullable(),
    expiryAlertDaysBefore: z.number().int().min(1).max(90).optional(),
    rfc: z.string().trim().max(20).optional().nullable(),
    website: z.string().trim().max(200).optional().nullable(),
  })
  .refine(
    (payload) =>
      payload.address !== undefined ||
      payload.expiryAlertDaysBefore !== undefined ||
      payload.rfc !== undefined ||
      payload.website !== undefined,
    {
      message: "No hay cambios para actualizar",
    },
  );

export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;
