import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

type Scope = { id: string; userId: string | null };
function signature(payload: string): string {
  const key = process.env.DIGESTOR_FISCAL_PASSWORD;
  if (!key) throw new Error("La carga de CSF no está configurada");
  return createHmac("sha256", key).update(`cotiza:csf-review:v1:${payload}`).digest("base64url");
}

// Stateless ownership proof. Never accept an arbitrary Digestor job/document id.
export function signCsfJob(jobId: string, tenant: Scope): string {
  const payload = Buffer.from(JSON.stringify({ jobId, tenant: tenant.id, actor: tenant.userId,
    expires: Date.now() + 30 * 60_000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyCsfJob(token: string, tenant: Scope): string | null {
  if (!token || token.length > 2000) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    return data.tenant === tenant.id && data.actor === tenant.userId &&
      typeof data.expires === "number" && data.expires > Date.now() && typeof data.jobId === "string"
      ? data.jobId : null;
  } catch { return null; }
}
