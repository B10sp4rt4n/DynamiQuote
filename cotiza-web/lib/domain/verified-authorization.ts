import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const VERIFIED_AUTHORIZATION = "verified_authorization_pilot";
export const APPROVAL_POLICY = "synappssys-pilot-v1";
export const ROOT_ROLES = ["owner", "superadmin", "super_admin", "platform_admin", "root"];
export const APPROVER_ROLES = [...ROOT_ROLES, "admin"];
export class ApprovalError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}
export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  throw new ApprovalError("Contenido no serializable", 422);
}
export function digest(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function tokenHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function tokenMatches(value: string, expected: string) {
  return /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(tokenHash(value), "hex"), Buffer.from(expected, "hex"));
}
const userId = z.string().regex(/^user_[A-Za-z0-9]+$/);
const purchase = z.object({
  folio: z.string().trim().min(1).max(80), vendor: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(600), amount: z.string().regex(/^(0|[1-9]\d{0,8})\.\d{2}$/),
  currency: z.enum(["MXN", "USD"]),
}).strict().refine(p => p.amount !== "0.00", "El importe debe ser positivo");
export const approvalInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("purchase"), approverUserId: userId, purchase }).strict(),
  z.object({ kind: z.literal("enrollment"), approverUserId: userId, targetUserId: userId }).strict(),
  z.object({ kind: z.literal("revocation"), approverUserId: userId, credentialId: z.string().uuid() }).strict(),
]);
export type ApprovalInput = z.infer<typeof approvalInputSchema>;
export type ApprovalSnapshot = { tenantId: string; tenantName: string; policy: string; credentialPolicy: "singleDevice" | "registered"; simulated: boolean; input: ApprovalInput };
export function snapshotFor(tenant: { id: string; name: string }, input: ApprovalInput, singleDevice = true): ApprovalSnapshot {
  return { tenantId: tenant.id, tenantName: tenant.name, policy: APPROVAL_POLICY, credentialPolicy: singleDevice ? "singleDevice" : "registered", simulated: input.kind === "purchase", input };
}
export function assertCredentialPolicy(type: string, backedUp: boolean, singleDevice: boolean) {
  if (!["singleDevice", "multiDevice"].includes(type) || (type === "singleDevice" && backedUp)) throw new ApprovalError("Estado de credencial inválido");
  if (singleDevice && type !== "singleDevice") throw new ApprovalError("Esta política exige una credencial de un solo autenticador; no admite passkeys sincronizables.");
}
export function bootstrapFresh(claims: Record<string, unknown>, now: Date, until: string, ids: string[], actorId: string) {
  const expires = Date.parse(until), age = claims.fva;
  return ids.includes(actorId) && expires > now.getTime() && expires <= now.getTime() + 86_400_000
    && Array.isArray(age) && typeof age[0] === "number" && age[0] >= 0 && age[0] <= 1
    && typeof claims.reverification_id === "string" && claims.reverification_id.length > 0;
}
export const registrationResponseSchema = z.object({ id: z.string().min(1).max(2048), rawId: z.string().min(1).max(2048), type: z.literal("public-key"),
  response: z.object({ clientDataJSON: z.string().max(12000), attestationObject: z.string().max(24000), transports: z.array(z.string()).optional() }).passthrough(),
  clientExtensionResults: z.record(z.string(), z.unknown()), authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
}).passthrough();
export const authenticationResponseSchema = z.object({ id: z.string().min(1).max(2048), rawId: z.string().min(1).max(2048), type: z.literal("public-key"),
  response: z.object({ clientDataJSON: z.string().max(12000), authenticatorData: z.string().max(12000), signature: z.string().max(12000), userHandle: z.string().nullable().optional() }),
  clientExtensionResults: z.record(z.string(), z.unknown()), authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
}).passthrough();
