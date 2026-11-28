import "server-only";
import { isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";

/** Workspace visibility is distinct from permission to operate the fiscal service. */
export function getFiscalWorkspaceAccess(tenantId: string) {
  const operationsEnabled = isDigestorFiscalEnabledForTenant(tenantId);
  const previewTenantId = process.env.CDC_FISCAL_PREVIEW_TENANT_ID?.trim();
  const previewOnly = !operationsEnabled && process.env.VERCEL_ENV === "preview"
    && Boolean(tenantId && previewTenantId && tenantId === previewTenantId);
  return { visible: operationsEnabled || previewOnly, operationsEnabled, previewOnly };
}
