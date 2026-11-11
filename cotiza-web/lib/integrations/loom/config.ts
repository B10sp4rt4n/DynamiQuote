import "server-only";
import { createHash } from "node:crypto";
import { LoomError } from "./domain";

export function loomConfig() {
  const tenantId = process.env.COTIZA_LOOM_TENANT_ID?.trim() ?? "";
  const cloudId = process.env.COTIZA_LOOM_CLOUD_ID?.trim() ?? "";
  const email = process.env.COTIZA_LOOM_EMAIL?.trim().toLowerCase() ?? "";
  const token = process.env.COTIZA_LOOM_API_TOKEN ?? "";
  const key = process.env.COTIZA_LOOM_PREVIEW_KEY ?? "";
  let origin: URL;
  try { origin = new URL(process.env.COTIZA_LOOM_APP_ORIGIN ?? ""); } catch { throw new LoomError("Falta configurar la conexión propia de Loom en Cotiza", 503); }
  if (!tenantId || !/^[a-f0-9-]{36}$/i.test(cloudId) || !/^[^:\s@]+@[^:\s@]+\.[^:\s@]+$/.test(email)
    || !token || /[\r\n]/.test(token) || !/^[a-f0-9]{64}$/i.test(key) || origin.protocol !== "https:"
    || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new LoomError("Falta configurar la conexión propia de Loom en Cotiza", 503);
  }
  return { tenantId, cloudId, origin: origin.origin, key: Buffer.from(key, "hex"),
    authorization: "Basic " + Buffer.from(email + ":" + token).toString("base64"),
    connectionKey: createHash("sha256").update(cloudId + ":" + email).digest("hex") };
}
