import { z } from "zod";

export const createProposalInvoiceSchema = z.object({
  customerName: z.string().trim().min(1, "Falta el nombre/razón social del receptor").max(200),
  customerRegimen: z.string().trim().regex(/^\d{3}$/, "El régimen debe tener tres dígitos"),
  customerRfc: z.string().trim().toUpperCase().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "Revisa el formato del RFC")
    .refine(value => !["XAXX010101000", "XEXX010101000"].includes(value), "El escenario de RFC genérico aún no está habilitado"),
  customerUseCfdi: z.string().trim().regex(/^[GIDS]\d{2}$/, "Revisa el formato del uso CFDI"),
  customerZip: z.string().trim().regex(/^\d{5}$/, "El código postal debe tener cinco dígitos"),
  notes: z.string().trim().max(500).optional().nullable(),
  paymentForm: z.enum(["01", "02", "03", "04", "28", "99"]),
  paymentMethod: z.enum(["PUE", "PPD"]),
  itemsFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  fiscalItems: z.array(z.object({
    itemNumber: z.number().int().positive(),
    satProductCode: z.string().trim().regex(/^\d{8}$/, "Captura la clave SAT de ocho dígitos"),
    unitCode: z.string().trim().regex(/^[A-Z0-9]{2,3}$/, "Captura la clave de unidad SAT"),
  }).strict()).min(1).max(500),
  saveToClient: z.boolean().optional(),
}).strict().superRefine((data, ctx) => {
  if ((data.paymentMethod === "PPD") !== (data.paymentForm === "99")) {
    ctx.addIssue({ code: "custom", path: ["paymentForm"], message: "PPD requiere forma 99; PUE requiere una forma de pago conocida" });
  }
});

export type CreateProposalInvoiceInput = z.infer<typeof createProposalInvoiceSchema>;
