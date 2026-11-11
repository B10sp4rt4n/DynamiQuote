import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { LoomError, type LoomSnapshot, type LoomTarget } from "./domain";

export function snapshotHash(snapshot: LoomSnapshot) {
  const { observedAt: _observedAt, ...content } = snapshot;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
function binding(target: LoomTarget, sourceId: string) {
  return createHash("sha256").update(JSON.stringify([target.tenantId, target.actorId, target.connectionKey,
    target.clientId, target.opportunityId, sourceId])).digest("hex");
}
export function signPreview(target: LoomTarget, snapshot: LoomSnapshot, key: Buffer, baseRevision: number | null, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ binding: binding(target, snapshot.sourceId), hash: snapshotHash(snapshot), baseRevision, expires: now + 600_000 })).toString("base64url");
  return payload + "." + createHmac("sha256", key).update(payload).digest("hex");
}
export function verifyPreview(token: string, target: LoomTarget, sourceId: string, key: Buffer, now = Date.now()) {
  const [payload, signature, extra] = token.split(".");
  const fail = () => new LoomError("La vista previa venció o cambió el expediente. Revisa la grabación de nuevo", 409);
  if (!payload || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) throw fail();
  const expected = createHmac("sha256", key).update(payload).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw fail();
  try {
    const parsed = z.object({ binding: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/), baseRevision: z.number().int().positive().nullable(), expires: z.number().int() }).strict().parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (parsed.binding !== binding(target, sourceId) || parsed.expires <= now || parsed.expires > now + 600_000) throw fail();
    return { hash: parsed.hash, baseRevision: parsed.baseRevision };
  } catch { throw fail(); }
}
