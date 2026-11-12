import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { LoomError, loomFollowupSchema, type LoomFollowup, type LoomLink, type LoomTarget } from "./domain";
import { snapshotHash } from "./preview";

const claimsSchema = z.object({ purpose: z.literal("loom-followup"), binding: z.string(), draftId: z.string().uuid(),
  linkId: z.string().min(1).max(200), revision: z.number().int().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  followup: loomFollowupSchema, expires: z.number().int() }).strict();
export type LoomFollowupClaims = z.infer<typeof claimsSchema>;
function binding(target: LoomTarget) {
  return createHash("sha256").update(JSON.stringify([target.tenantId, target.actorId, target.connectionKey,
    target.clientId, target.opportunityId])).digest("hex");
}
export function reviewLoomFollowup(target: LoomTarget, link: LoomLink, followup: LoomFollowup, key: Buffer, now = Date.now()) {
  if (link.snapshot.transcriptStatus !== "ready" || !link.snapshot.transcript?.includes(followup.excerpt)) {
    throw new LoomError("El fragmento debe coincidir exactamente con la transcripción conservada", 422);
  }
  const claims: LoomFollowupClaims = { purpose: "loom-followup", binding: binding(target), draftId: randomUUID(),
    linkId: link.linkId, revision: link.revision, sourceHash: snapshotHash(link.snapshot), followup, expires: now + 600_000 };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: payload + "." + createHmac("sha256", key).update("loom-followup:" + payload).digest("hex"),
    followup, source: { title: link.snapshot.title, url: link.snapshot.url, observedAt: link.snapshot.observedAt, revision: link.revision } };
}
export function verifyLoomFollowup(token: string, target: LoomTarget, key: Buffer, now = Date.now()): LoomFollowupClaims {
  const fail = () => new LoomError("La revisión del seguimiento venció o cambió el expediente. Revísalo de nuevo", 409);
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) throw fail();
  if (!timingSafeEqual(createHmac("sha256", key).update("loom-followup:" + payload).digest(), Buffer.from(signature, "hex"))) throw fail();
  try {
    const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (claims.binding !== binding(target) || claims.expires <= now || claims.expires > now + 600_000) throw fail();
    return claims;
  } catch { throw fail(); }
}
