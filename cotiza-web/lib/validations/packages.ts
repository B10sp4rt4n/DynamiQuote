import { z } from "zod";
import { quoteInputIdSchema } from "@/lib/domain/quote-input";

export const packageLineInputSchema = z.object({
  classification1: z.string().max(100).optional(),
  classification2: z.string().max(100).optional(),
  costUnit: z.number().min(0),
  description: z.string().trim().min(1).max(4000),
  marginPct: z.number().min(-100).max(100).optional(),
  priceUnit: z.number().min(0),
  quantity: z.number().finite().int().positive(),
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
  quoteId: quoteInputIdSchema,
  operationId: z.string().uuid(),
  expectedRevision: z.string().length(64).optional(),
  quantities: z.array(z.object({ lineId: z.string().min(1), quantity: z.number().finite().int().positive() })).max(200).optional(),
});

export const createPackageFromQuoteSchema = z.object({
  quoteId: quoteInputIdSchema,
  operationId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  playbookTag: z.string().trim().max(100).optional(),
});
