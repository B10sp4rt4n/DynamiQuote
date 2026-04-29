import { z } from "zod";

export const packageLineInputSchema = z.object({
  classification1: z.string().max(100).optional(),
  classification2: z.string().max(100).optional(),
  costUnit: z.number().min(0),
  description: z.string().min(1).max(500),
  marginPct: z.number().min(-100).max(100).optional(),
  priceUnit: z.number().min(0),
  quantity: z.number().positive(),
  sku: z.string().max(100).optional(),
});

export const createPackageSchema = z.object({
  createdBy: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  lines: z.array(packageLineInputSchema).min(1).max(200),
  name: z.string().min(1).max(200),
  playbookTag: z.string().max(100).optional(),
});

export const updatePackageMetaSchema = z.object({
  description: z.string().max(500).optional(),
  name: z.string().min(1).max(200).optional(),
  playbookTag: z.string().max(100).optional(),
});

export const insertPackageIntoQuoteSchema = z.object({
  quoteId: z.string().uuid(),
});
