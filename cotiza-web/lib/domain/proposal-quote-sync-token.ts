import { createHash } from "node:crypto";
export type QuoteSyncItem = { itemNumber: number; componentType: string; costUnit: number; priceUnit: number; quantity: number; description: string; sku: string; origin: string; status: string };
export function proposalQuoteSyncToken(items: QuoteSyncItem[]): string {
  return createHash("sha256").update(JSON.stringify(items.map(i => [i.itemNumber, i.componentType, i.costUnit, i.priceUnit, i.quantity, i.description, i.sku, i.origin, i.status]))).digest("hex");
}
