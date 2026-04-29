import { z } from "zod";

export const editableQuoteLineResponseSchema = z.object({
  classification1: z.enum(["product", "service"]),
  classification2: z.string(),
  costUnit: z.number(),
  description: z.string(),
  lineId: z.string(),
  marginPct: z.number(),
  priceUnit: z.number(),
  quantity: z.number(),
  sku: z.string().nullable(),
});

export const quoteVersionResponseSchema = z.object({
  avgMargin: z.number(),
  clientName: z.string(),
  createdAt: z.string(),
  playbookName: z.string().nullable(),
  proposalName: z.string(),
  quoteGroupId: z.string(),
  quoteId: z.string(),
  status: z.string(),
  totalRevenue: z.number(),
  version: z.number().int().positive(),
  versionCount: z.number().int().positive(),
});

export const quoteLinesGetResponseSchema = z.object({
  lines: z.array(editableQuoteLineResponseSchema),
});

export const quoteLinesPutResponseSchema = z.object({
  lines: z.array(editableQuoteLineResponseSchema),
  quote: quoteVersionResponseSchema,
  totals: z.object({
    avgMargin: z.number(),
    grossProfit: z.number(),
    totalCost: z.number(),
    totalRevenue: z.number(),
  }),
});

export const quoteVersionHistoryItemSchema = z.object({
  avgMargin: z.number().nullable(),
  createdAt: z.string().nullable(),
  quoteId: z.string(),
  status: z.string(),
  totalRevenue: z.number().nullable(),
  version: z.number().int().positive(),
});

export const quoteVersionsResponseSchema = z.object({
  currentQuoteId: z.string(),
  quoteGroupId: z.string(),
  versions: z.array(quoteVersionHistoryItemSchema),
});

export type EditableQuoteLineResponse = z.infer<typeof editableQuoteLineResponseSchema>;
export type QuoteLinesGetResponse = z.infer<typeof quoteLinesGetResponseSchema>;
export type QuoteLinesPutResponse = z.infer<typeof quoteLinesPutResponseSchema>;
export type QuoteVersionResponse = z.infer<typeof quoteVersionResponseSchema>;
export type QuoteVersionHistoryItem = z.infer<typeof quoteVersionHistoryItemSchema>;
export type QuoteVersionsResponse = z.infer<typeof quoteVersionsResponseSchema>;
