import "server-only";

export class MercadoLibreError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function mercadoLibreEnabled(tenantId: string) {
  return process.env.MERCADOLIBRE_ENABLED === "true"
    && (process.env.MERCADOLIBRE_TENANT_IDS ?? "").split(",").map(s => s.trim()).includes(tenantId);
}

export function mercadoLibreConfig() {
  const clientId = process.env.MERCADOLIBRE_CLIENT_ID ?? "";
  const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET ?? "";
  const redirectUri = process.env.MERCADOLIBRE_REDIRECT_URI ?? "";
  const key = process.env.MERCADOLIBRE_TOKEN_KEY ?? "";
  let url: URL;
  try { url = new URL(redirectUri); } catch { throw new MercadoLibreError("Falta configurar la conexión de Mercado Libre", 503); }
  if (!/^\d+$/.test(clientId) || !clientSecret || !/^[a-fA-F0-9]{64}$/.test(key)
      || url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.pathname !== "/api/integrations/mercadolibre/callback") {
    throw new MercadoLibreError("Falta configurar la conexión de Mercado Libre", 503);
  }
  return { clientId, clientSecret, redirectUri, origin: url.origin, key: Buffer.from(key, "hex") };
}

export function mercadoLibreReady() {
  try { mercadoLibreConfig(); return true; } catch { return false; }
}
