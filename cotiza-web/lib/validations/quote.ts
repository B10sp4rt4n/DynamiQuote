import { z } from "zod";

import { quoteLineSchema } from "@/lib/validations/domain";

export const quoteLineInputSchema = quoteLineSchema.pick({
  classification1: true,
  classification2: true,
  costUnit: true,
  description: true,
  marginPct: true,
  priceUnit: true,
  quantity: true,
  sku: true,
});

export type QuoteLineInput = z.infer<typeof quoteLineInputSchema>;
