import { z } from "zod";

export const quoteLineEditorInputSchema = z
  .object({
    classification1: z.enum(["product", "service"]),
    classification2: z.string().trim().optional(),
    costUnit: z.number().min(0),
    description: z.string().trim().max(4000).optional(),
    lineId: z.string().min(1),
    marginPct: z.number().min(0).max(99.99).optional(),
    mode: z.enum(["margin", "price"]),
    priceUnit: z.number().min(0).optional(),
    quantity: z.number().positive(),
    sku: z.string().trim().max(120).optional(),
  })
  .refine((value) => value.marginPct !== undefined || value.priceUnit !== undefined, {
    message: "Debes enviar marginPct o priceUnit",
    path: ["priceUnit"],
  });

export const updateQuoteLinesSchema = z.object({
  lines: z.array(quoteLineEditorInputSchema).min(1),
});

export type QuoteLineEditorInput = z.infer<typeof quoteLineEditorInputSchema>;
export type UpdateQuoteLinesInput = z.infer<typeof updateQuoteLinesSchema>;
