import { z } from "zod";

export const SALE_NATURES = {
  license: "Licencia o suscripción de software", managed_service: "Servicio administrado",
  implementation: "Implementación o consultoría", support: "Soporte o mantenimiento",
  goods: "Producto o equipo", other: "Otro tipo de operación",
} as const;
export type SaleNature = keyof typeof SALE_NATURES;
export type SatCatalogKind = "product" | "unit";
export type SatCatalogInfo = { cfdiVersion: string; source: string; sourceUrl: string; sourceFile: string;
  publishedAt: string; checkedAt: string; sourceSha256: string; counts: { product: number; unit: number } };
export type SatCatalogEntry = { code: string; description: string; details: string; notes: string;
  valid: boolean; validFrom: string | null; validTo: string | null;
  matchedTerms?: string[]; domainRelations?: string[]; method?: string; rankScore?: number };
export type SatSearchResult = { catalog: SatCatalogInfo; results: SatCatalogEntry[] };
export type SatValidation = { valid: boolean; catalog: SatCatalogInfo; error?: string;
  items: { itemNumber: number; valid: boolean; product: SatCatalogEntry | null; unit: SatCatalogEntry | null; error: string | null }[] };
export type FiscalClassification = { itemNumber: number; satProductCode: string; unitCode: string;
  catalogVersion: string; classificationEventId: string };
export type ClassificationMemory = { satProductCode: string; unitCode: string; catalogVersion: string; confirmedAt: string };
export const confirmClassificationSchema = z.object({
  itemNumber: z.number().int().positive(), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  nature: z.enum(["license", "managed_service", "implementation", "support", "goods", "other"]),
  satProductCode: z.string().regex(/^\d{8}$/), unitCode: z.string().regex(/^[A-Za-z0-9]{2,3}$/),
  catalogVersion: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.literal(true), remember: z.boolean(),
}).strict();
export function normalizeConcept(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
