import { z } from "zod";

export const MAX_INVOICE_NUMBER = 999_999_999_999;
export const invoiceNumberingInput = z.object({
  prefix: z.string().max(25, "El prefijo admite hasta 25 caracteres").regex(/^[A-Z0-9-]*$/, "Usa letras, números o guiones en la serie"),
  include_year: z.boolean(), reset_annually: z.boolean(), digits: z.number().int().min(1, "Elige entre 1 y 12 dígitos").max(12, "Elige entre 1 y 12 dígitos"),
  next_number: z.number().int("El próximo número debe ser entero").min(1, "El próximo número debe ser mayor a cero").max(MAX_INVOICE_NUMBER, "La serie agotó sus números; configura otra serie"), expected_revision: z.number().int().min(0),
}).strict().superRefine((value, context) => {
  if (value.reset_annually && !value.include_year) context.addIssue({ code: "custom", message: "El reinicio anual requiere incluir el año" });
  if (value.include_year && value.prefix.length > 20) context.addIssue({ code: "custom", message: "Con año, el prefijo admite hasta 20 caracteres" });
});
export type InvoiceNumberingInput = z.infer<typeof invoiceNumberingInput>;
const policy = z.object({ prefix: z.string(), include_year: z.boolean(), reset_annually: z.boolean(),
  digits: z.number().int().min(1).max(12), next_number: z.number().int().min(1).max(MAX_INVOICE_NUMBER + 1),
  revision: z.number().int().min(1), series: z.string(), year: z.number().int(), examples: z.array(z.string()).max(3) });
export const invoiceNumberingState = z.object({ available: z.boolean(), year: z.number().int(), policy: policy.nullable() });
export type InvoiceNumberingState = z.infer<typeof invoiceNumberingState>;

export function numberingPreview(input: Pick<InvoiceNumberingInput, "prefix" | "include_year" | "digits" | "next_number">, year: number) {
  const series = [input.prefix, input.include_year ? String(year) : ""].filter(Boolean).join("-");
  return Array.from({ length: Math.max(0, Math.min(3, MAX_INVOICE_NUMBER - input.next_number + 1)) }, (_, index) =>
    [series, String(input.next_number + index).padStart(input.digits, "0")].filter(Boolean).join("-"));
}
