import { z } from "zod";

export const marginPolicyInputSchema = z
  .object({
    highPreapprovalMarginPct: z.number().min(0).max(99.99),
    maxMarginPct: z.number().min(0).max(99.99),
    minMarginPct: z.number().min(0).max(99.99),
    requireObserverApproval: z.boolean(),
  })
  .refine((value) => value.minMarginPct <= value.maxMarginPct, {
    message: "El margen minimo no puede ser mayor al maximo",
    path: ["minMarginPct"],
  })
  .refine((value) => value.maxMarginPct <= value.highPreapprovalMarginPct, {
    message: "El umbral alto debe ser igual o mayor al margen maximo",
    path: ["highPreapprovalMarginPct"],
  });

export type MarginPolicyInput = z.infer<typeof marginPolicyInputSchema>;