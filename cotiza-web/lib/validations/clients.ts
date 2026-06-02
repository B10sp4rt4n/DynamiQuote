import { z } from "zod";

export const createClientSchema = z.object({
  address: z.string().trim().max(300).optional().nullable(),
  company: z.string().trim().min(1, "La empresa es requerida").max(200),
  contactEmail: z.string().trim().email("Email no válido").max(200).optional().nullable(),
  contactName: z.string().trim().max(150).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  contactTitle: z.string().trim().max(100).optional().nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  rfc: z.string().trim().max(20).optional().nullable(),
});

export const updateClientSchema = createClientSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
