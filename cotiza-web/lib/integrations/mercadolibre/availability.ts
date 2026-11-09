import "server-only";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { MERCADOLIBRE_CHANNEL } from "@/lib/tenant-capabilities";

/** The global switch never grants access. Every tenant needs an explicit entitlement. */
export async function mercadoLibreEnabled(tenantId: string): Promise<boolean> {
  return process.env.MERCADOLIBRE_ENABLED === "true"
    && await isTenantCapabilityEnabled(tenantId, MERCADOLIBRE_CHANNEL);
}
