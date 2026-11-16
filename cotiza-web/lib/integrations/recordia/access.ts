import "server-only";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
import { RECORDIA_MCP_PREMIUM, RECORDIA_PILOT_TENANT_ID, RECORDIA_PILOT_TENANT_SLUG,
  RecordiaError, type RecordiaActor } from "./domain";

const SUPER_ROLES = new Set(["superadmin", "super_admin", "platform_admin", "root"]);
type Viewer = { id: string; slug?: string; authMode: string; userId?: string | null; isSuperAdmin: boolean };

function configured() {
  const expiry = process.env.COTIZA_RECORDIA_VALID_UNTIL ?? "";
  // Timezone is mandatory; never interpret a server-local wall clock as UTC.
  return process.env.COTIZA_RECORDIA_ENABLED === "true"
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(expiry)
    && Number.isFinite(Date.parse(expiry)) && Date.now() < Date.parse(expiry);
}
export async function recordiaPilotVisible(tenant: Viewer) {
  return configured() && tenant.id === RECORDIA_PILOT_TENANT_ID
    && tenant.slug === RECORDIA_PILOT_TENANT_SLUG
    && tenant.authMode === "clerk" && Boolean(tenant.userId) && tenant.isSuperAdmin
    && await isTenantCapabilityEnabled(tenant.id, RECORDIA_MCP_PREMIUM);
}

export async function revalidateRecordiaActor(actor: RecordiaActor) {
  if (!configured() || actor.tenantId !== RECORDIA_PILOT_TENANT_ID) throw new RecordiaError("Piloto Recordia no disponible", 404);
  const [tenant, member, enabled] = await Promise.all([
    prisma.tenant.findFirst({ where: { tenant_id: actor.tenantId, slug: RECORDIA_PILOT_TENANT_SLUG, active: true }, select: { tenant_id: true } }),
    prisma.app_users.findFirst({ where: { user_id: actor.actorId, active: true }, select: { role: true } }),
    isTenantCapabilityEnabled(actor.tenantId, RECORDIA_MCP_PREMIUM),
  ]);
  if (!tenant || !enabled || !member || !SUPER_ROLES.has(member.role.toLowerCase())) {
    throw new RecordiaError("Piloto Recordia no disponible", 404);
  }
}

export async function authorizeRecordia(request: Request): Promise<RecordiaActor> {
  const { userId } = await auth();
  if (!userId) throw new RecordiaError("Inicia sesión para consultar Recordia", 401);
  const tenant = await getCurrentTenantContext();
  if (!tenant || tenant.authMode !== "clerk" || tenant.userId !== userId) throw new RecordiaError("Sesión no disponible", 401);
  if (tenant.id !== RECORDIA_PILOT_TENANT_ID || tenant.slug !== RECORDIA_PILOT_TENANT_SLUG) throw new RecordiaError("Piloto Recordia no disponible", 404);
  if (request.headers.get("x-tenant-context") !== tenant.id) throw new RecordiaError("Cambió la empresa activa. Recarga el expediente", 409);
  let origin: string;
  try {
    const configuredOrigin = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}` : process.env.COTIZA_RECORDIA_APP_ORIGIN;
    const url = new URL(configuredOrigin ?? "");
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) throw Error();
    origin = url.origin;
  } catch { throw new RecordiaError("Conexión Recordia no configurada", 503); }
  if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin) throw new RecordiaError("Origen no autorizado", 403);
  const actor = { tenantId: tenant.id, actorId: userId };
  await revalidateRecordiaActor(actor);
  if (!enforceRateLimit(`recordia:${actor.tenantId}:${actor.actorId}`, 90, 60_000).allowed) throw new RecordiaError("Espera un minuto antes de consultar de nuevo", 429);
  return actor;
}
