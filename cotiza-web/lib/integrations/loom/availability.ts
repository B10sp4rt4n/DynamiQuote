import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { LOOM_CONTEXT } from "@/lib/tenant-capabilities";

type Viewer = { id: string; userId?: string | null; authMode: string; isSuperAdmin: boolean };
/** Visibility is not authorization. Routes recheck the database role and configuration. */
export async function loomPilotVisible(tenant: Viewer) {
  return process.env.COTIZA_LOOM_ENABLED === "true"
    && process.env.COTIZA_LOOM_TENANT_ID === tenant.id
    && tenant.authMode === "clerk" && Boolean(tenant.userId) && tenant.isSuperAdmin
    && await isTenantCapabilityEnabled(tenant.id, LOOM_CONTEXT);
}
