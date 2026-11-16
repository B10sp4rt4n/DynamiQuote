import "server-only";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import { ApprovalError, VERIFIED_AUTHORIZATION } from "@/lib/domain/verified-authorization";

export type ApprovalActor = { userId: string; issuer: string; tenantId: string; tenantName: string; role: string; claims: Record<string, unknown> };
export type ApprovalConfig = { tenantId: string; issuer: string; origin: string; rpId: string; singleDevice: boolean };
// Nominación explícita por ID Clerk: la reconciliación legacy de otras pantallas no puede elevar permisos del piloto.
export function nominatedApprover(userId: string, management = false) {
  const nominated = (key: string) => (process.env[key] ?? "").split(",").map(v => v.trim()).filter(v => /^user_[A-Za-z0-9]+$/.test(v)).includes(userId);
  return nominated("COTIZA_APPROVAL_APPROVER_USER_IDS") && (!management || nominated("COTIZA_APPROVAL_MANAGER_USER_IDS"));
}
export function approvalConfig(): ApprovalConfig {
  const { COTIZA_APPROVAL_ENABLED: enabled, COTIZA_APPROVAL_TENANT_ID: tenantId, COTIZA_APPROVAL_ISSUER: issuer, COTIZA_APPROVAL_ORIGIN: origin } = process.env;
  if (enabled !== "true" || !tenantId || !issuer || !origin) throw new ApprovalError("El piloto de autorización verificable no está habilitado", 404);
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password) throw new ApprovalError("Configura un origen HTTPS estable para el piloto", 503);
  return { tenantId, issuer, origin, rpId: parsed.hostname, singleDevice: process.env.COTIZA_APPROVAL_SINGLE_DEVICE !== "false" };
}
/** No usa tenant-context: nunca reconcilia identidades ni acepta cookies de desarrollo. */
export async function getApprovalActor(): Promise<ApprovalActor> {
  const config = approvalConfig();
  const session = await auth();
  if (!session.userId || !session.sessionId || session.sessionClaims?.sts === "pending" || session.sessionClaims?.iss !== config.issuer) throw new ApprovalError("Inicia sesión con tu cuenta de Cotiza", 401);
  const [member, tenant, capability] = await Promise.all([
    prisma.app_users.findUnique({ where: { user_id: session.userId } }),
    prisma.tenant.findUnique({ where: { tenant_id: config.tenantId } }),
    prisma.tenantCapability.findUnique({ where: { tenant_id_capability_key: { tenant_id: config.tenantId, capability_key: VERIFIED_AUTHORIZATION } } }),
  ]);
  // El piloto modela exclusivamente SynAppsSys y exige membresía local exacta, incluso para superadmin.
  if (!tenant?.active || tenant.slug !== "sys" || !capability?.enabled || !member?.active || member.user_id !== session.userId || member.tenant_id !== tenant.tenant_id) throw new ApprovalError("Esta cuenta no tiene acceso al piloto de SynAppsSys");
  return { userId: session.userId, issuer: config.issuer, tenantId: tenant.tenant_id, tenantName: tenant.name, role: member.role, claims: session.sessionClaims as Record<string, unknown> };
}
