import { z } from "zod";

export const registerBillingPaymentSchema = z.object({
  idempotency_key: z.uuid(),
  reference: z.string().trim().min(1).max(100),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Importe positivo con hasta dos decimales")
    .refine(value => Number(value) > 0, "El importe debe ser mayor a cero"),
  paid_at: z.iso.datetime({ offset: true }),
  payment_form: z.enum(["01", "02", "03", "04", "28"]),
}).strict();
