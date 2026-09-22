import { z } from "zod";

export const createClientSchema = z.object({
  address: z.string().trim().max(300).optional().nullable(),
  cfdiUse: z.string().trim().max(10).optional().nullable(),
  clientLogoId: z.string().trim().min(1).max(100).optional().nullable(),
  company: z.string().trim().min(1, "La empresa es requerida").max(200),
  contactEmail: z.string().trim().email("Email no válido").max(200).optional().nullable(),
  contactFirstName: z.string().trim().max(80).optional().nullable(),
  contactLastName: z.string().trim().max(80).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  contactTitle: z.string().trim().max(100).optional().nullable(),
  fiscalRegime: z.string().trim().max(10).optional().nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  rfc: z.string().trim().max(20).optional().nullable(),
  zipCode: z.string().trim().max(10).optional().nullable(),
});

export const updateClientSchema = createClientSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// Validacion en vivo contra catalogos SAT (Digestor Fiscal, /v1/receptor/validate)
// -- no persiste nada, solo valida lo que el usuario ya tecleo en el
// formulario de cliente, antes o despues de guardar.
export const validateClientFiscalDataSchema = z.object({
  cp: z.string().trim().min(1, "El código postal es requerido").max(10),
  nombre: z.string().trim().max(200).optional(),
  pacCheck: z.boolean().optional(),
  regimen: z.string().trim().min(1, "El régimen fiscal es requerido").max(10),
  rfc: z.string().trim().min(1, "El RFC es requerido").max(20),
  usoCfdi: z.string().trim().max(10).optional(),
});

export type ValidateClientFiscalDataInput = z.infer<typeof validateClientFiscalDataSchema>;
