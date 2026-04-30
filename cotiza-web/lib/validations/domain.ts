import { z } from "zod";

import {
  proposalStatusValues,
  quoteClassificationOneValues,
} from "@/lib/domain/entities";

export const quoteCodeSchema = z.string().regex(/^COT-[0-9]{4,}$/, "Codigo de cotizacion invalido");
export const proposalCodeSchema = z.string().regex(/^PROP-[0-9]{4,}$/, "Codigo de propuesta invalido");
export const packageCodeSchema = z.string().regex(/^PKG-[0-9]{4,}$/, "Codigo de paquete invalido");

export const classificationOneSchema = z.enum(quoteClassificationOneValues);

export const quoteLineSchema = z
  .object({
    id: z.string().min(1),
    quoteId: z.string().min(1),
    sku: z.string().trim().nullish(),
    description: z.string().trim().min(1),
    quantity: z.number().positive(),
    costUnit: z.number().min(0),
    priceUnit: z.number().min(0).nullish(),
    marginPct: z.number().min(0).max(99.99).nullish(),
    classification1: classificationOneSchema,
    classification2: z.string().trim().nullish(),
  })
  .refine((value) => value.priceUnit !== undefined || value.marginPct !== undefined, {
    message: "Debes enviar priceUnit o marginPct",
    path: ["priceUnit"],
  });

export const quoteInputSchema = z.object({
  code: quoteCodeSchema,
  groupId: z.string().min(1),
  tenantId: z.string().min(1),
  clientName: z.string().trim().nullish(),
  proposalName: z.string().trim().nullish(),
  quotedBy: z.string().trim().nullish(),
  lines: z.array(quoteLineSchema).min(1),
});

export const proposalStatusSchema = z.enum(proposalStatusValues);

export const proposalConditionSchema = z.object({
  id: z.string().min(1),
  proposalId: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  order: z.number().int().min(1),
});

export const proposalInputSchema = z.object({
  code: proposalCodeSchema,
  tenantId: z.string().min(1),
  origin: z.string().trim().nullish(),
  status: proposalStatusSchema.default("draft"),
  conditions: z.array(proposalConditionSchema),
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;
export type ProposalInput = z.infer<typeof proposalInputSchema>;
export type ProposalConditionInput = z.infer<typeof proposalConditionSchema>;
