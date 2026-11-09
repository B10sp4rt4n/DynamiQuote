import "server-only";

export type DigestorFiscalConfig = {
  baseUrl: string; username: string; password: string;
  environment: "primary" | "sandbox"; expectedTenantId?: string;
};

export function getPrimaryDigestorConfig(): DigestorFiscalConfig | null {
  const baseUrl = process.env.DIGESTOR_FISCAL_BASE_URL;
  const username = process.env.DIGESTOR_FISCAL_USERNAME;
  const password = process.env.DIGESTOR_FISCAL_PASSWORD;
  return baseUrl && username && password ? { baseUrl: baseUrl.replace(/\/+$/, ""), username, password, environment: "primary" } : null;
}

export function isDigestorFiscalSandboxTenant(tenantId: string): boolean {
  return Boolean(tenantId) && tenantId === process.env.DIGESTOR_FISCAL_SANDBOX_TENANT_ID;
}

export function getSandboxDigestorConfig(): DigestorFiscalConfig | null {
  if (process.env.DIGESTOR_FISCAL_SANDBOX_ENABLED !== "true") return null;
  const expectedTenantId = process.env.DIGESTOR_FISCAL_SANDBOX_TENANT_ID;
  const baseUrl = process.env.DIGESTOR_FISCAL_SANDBOX_BASE_URL;
  const username = process.env.DIGESTOR_FISCAL_SANDBOX_USERNAME;
  const password = process.env.DIGESTOR_FISCAL_SANDBOX_PASSWORD;
  if (!expectedTenantId || expectedTenantId === process.env.DIGESTOR_FISCAL_TENANT_ID || !baseUrl || !username || !password) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return null;
    const primary = getPrimaryDigestorConfig();
    if (primary && new URL(primary.baseUrl).origin === url.origin) return null;
    return { baseUrl: url.origin, username, password, environment: "sandbox", expectedTenantId };
  } catch { return null; }
}

export async function getRequestDigestorConfig(): Promise<DigestorFiscalConfig | null> {
  // Preserve the established single-issuer integration when the optional lab is absent.
  if (!process.env.DIGESTOR_FISCAL_SANDBOX_TENANT_ID) return getPrimaryDigestorConfig();
  const { getCurrentTenantContext } = await import("@/lib/auth/tenant-context");
  const tenant = await getCurrentTenantContext();
  if (!tenant) throw new Error("Se requiere una empresa autenticada para elegir el entorno fiscal");
  if (!isDigestorFiscalSandboxTenant(tenant.id)) return getPrimaryDigestorConfig();
  if (tenant.authMode !== "clerk") throw new Error("Inicia sesión para operar el laboratorio fiscal");
  const config = getSandboxDigestorConfig();
  if (!config) throw new Error("La conexión fiscal de pruebas no está disponible");
  return config;
}
