import "server-only";
import { GmailError } from "./domain";

export function gmailConfig() {
  const clientId = process.env.COTIZA_GMAIL_CLIENT_ID ?? "";
  const clientSecret = process.env.COTIZA_GMAIL_CLIENT_SECRET ?? "";
  const tenantId = process.env.COTIZA_GMAIL_TENANT_ID ?? "";
  const email = (process.env.COTIZA_GMAIL_ACCOUNT ?? "").toLowerCase().trim();
  const key = process.env.COTIZA_GMAIL_TOKEN_KEY ?? "";
  let url: URL;
  try { url = new URL(process.env.COTIZA_GMAIL_REDIRECT_URI ?? ""); }
  catch { throw new GmailError("Falta configurar la autorización de Google", 503); }
  if (!clientId.endsWith(".apps.googleusercontent.com") || !clientSecret || !tenantId
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-fA-F0-9]{64}$/.test(key)
    || url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || url.pathname !== "/api/integrations/gmail/callback") {
    throw new GmailError("Falta configurar la autorización de Google", 503);
  }
  return { clientId, clientSecret, tenantId, email, key: Buffer.from(key, "hex"), origin: url.origin, redirectUri: url.toString() };
}
export function gmailReady() { try { gmailConfig(); return true; } catch { return false; } }
