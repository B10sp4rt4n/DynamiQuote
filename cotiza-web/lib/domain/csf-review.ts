import { z } from "zod";

export const CSF_MAX_BYTES = 4 * 1024 * 1024;
const placeholder = /^(SIN NOMBRE|DESCONOCIDO|PENDIENTE|N\/A|NULL)$/i;
export const clientFiscalValuesSchema = z.object({
  address: z.string().trim().max(300),
  company: z.string().trim().min(1, "La razón social es requerida").max(200)
    .refine((v) => !placeholder.test(v), "Reemplaza la razón social provisional"),
  fiscalRegime: z.string().trim().regex(/^\d{3}$/, "Selecciona un código de régimen de tres dígitos"),
  rfc: z.string().trim().toUpperCase().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "Revisa el formato del RFC")
    .refine((v) => !["XAXX010101000", "XEXX010101000"].includes(v), "La CSF debe identificar al contribuyente"),
  zipCode: z.string().trim().regex(/^\d{5}$/, "El CP debe tener cinco dígitos"),
});

export type ClientFiscalValues = z.infer<typeof clientFiscalValuesSchema>;
export type CsfReview = {
  revision: string;
  values: ClientFiscalValues;
  regimeText: string;
  issues: Record<string, string>;
  cifId: string;
  suggestions: { field: string; suggested_value: string; reason?: string; confidence?: number }[];
  validationScope: string;
  regimeOptions?: { code: string; label: string }[];
};

export const CSF_FIELDS = [
  { key: "company", label: "Razón social" },
  { key: "rfc", label: "RFC" },
  { key: "fiscalRegime", label: "Régimen fiscal (código SAT)" },
  { key: "zipCode", label: "Código postal" },
  { key: "address", label: "Domicilio" },
] as const;
