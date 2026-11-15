import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { gmailConfig } from "./config";
import { GmailError, type GmailSnapshot, type GmailTarget } from "./domain";
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const nonce = () => randomBytes(32).toString("base64url");
export function seal(value: string, context: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", gmailConfig().key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function unseal(value: string, context: string) {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra) throw Error("Invalid encrypted Gmail data");
  const cipher = createDecipheriv("aes-256-gcm", gmailConfig().key, Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(encrypted, "base64url")), cipher.final()]).toString("utf8");
}
export function snapshotHash(snapshot: GmailSnapshot) {
  const content = { ...snapshot, observedAt: undefined };
  return digest(JSON.stringify(content));
}
const binding = (target: GmailTarget, email: string, messageId: string) => digest(JSON.stringify([
  target.tenantId, target.actorId, target.clientId, target.opportunityId, gmailConfig().clientId, email, messageId,
]));
export function signPreview(target: GmailTarget, email: string, snapshot: GmailSnapshot, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ binding: binding(target, email, snapshot.messageId), hash: snapshotHash(snapshot),
    expires: now + 600_000 })).toString("base64url");
  return body + "." + createHmac("sha256", gmailConfig().key).update(body).digest("hex");
}
export function verifyPreview(token: string, target: GmailTarget, email: string, messageId: string, now = Date.now()): string {
  const fail = () => new GmailError("La revisión venció o cambió el expediente. Revisa el correo de nuevo", 409);
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) throw fail();
  if (!timingSafeEqual(createHmac("sha256", gmailConfig().key).update(body).digest(), Buffer.from(signature, "hex"))) throw fail();
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
    if (parsed.binding !== binding(target, email, messageId) || !/^[a-f0-9]{64}$/.test(parsed.hash)
      || !Number.isSafeInteger(parsed.expires) || parsed.expires <= now || parsed.expires > now + 600_000) throw fail();
    return parsed.hash;
  } catch { throw fail(); }
}
