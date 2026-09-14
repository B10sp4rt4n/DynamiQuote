import { z } from "zod";

export const createProposalInvoiceSchema = z.object({
  customerName: z.string().trim().min(1, "Falta el nombre/razón social del receptor").max(200),
  customerRegimen: z.string().trim().min(1, "Falta el régimen fiscal del receptor").max(10),
  customerRfc: z.string().trim().min(1, "Falta el RFC del receptor").max(20),
  customerUseCfdi: z.string().trim().min(1, "Falta el uso de CFDI").max(10),
  customerZip: z.string().trim().min(1, "Falta el código postal del receptor").max(10),
  notes: z.string().trim().max(500).optional().nullable(),
  paymentForm: z.string().trim().min(1, "Falta la forma de pago").max(5),
  paymentMethod: z.enum(["PUE", "PPD"]),
  saveToClient: z.boolean().optional(),
});

export type CreateProposalInvoiceInput = z.infer<typeof createProposalInvoiceSchema>;
