import { z } from "zod";

export const updateTenantProfileSchema = z
  .object({
    address: z.string().trim().max(300).optional().nullable(),
    closingContactLabel: z.string().trim().max(200).optional().nullable(),
    closingContactLevel: z.enum(["contacto", "contacto_correo", "contacto_correo_telefono"]).optional(),
    expiryAlertDaysBefore: z.number().int().min(1).max(90).optional(),
    razonSocial: z.string().trim().max(300).optional().nullable(),
    rfc: z.string().trim().max(20).optional().nullable(),
    website: z.string().trim().max(200).optional().nullable(),
  })
  .refine(
    (payload) =>
      payload.address !== undefined ||
      payload.closingContactLabel !== undefined ||
      payload.closingContactLevel !== undefined ||
      payload.expiryAlertDaysBefore !== undefined ||
      payload.razonSocial !== undefined ||
      payload.rfc !== undefined ||
      payload.website !== undefined,
    {
      message: "No hay cambios para actualizar",
    },
  );

export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;
