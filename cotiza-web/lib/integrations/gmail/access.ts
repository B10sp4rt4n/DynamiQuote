import "server-only";
import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
import { gmailConfig } from "./config";
import { gmailPilotVisible } from "./availability";
import { GmailError, type GmailActor, type GmailTarget } from "./domain";

export async function authorizeGmail(request?: Request): Promise<GmailActor> {
  const tenant = await getCurrentTenantContext();
  if (!tenant || tenant.authMode !== "clerk" || !tenant.userId) throw new GmailError("Inicia sesión para consultar Gmail", 401);
  if (!gmailPilotVisible(tenant)) throw new GmailError("Gmail no está habilitado para este usuario y empresa", 404);
  const member = await prisma.app_users.findFirst({ where: { user_id: tenant.userId, active: true }, select: { role: true } });
  if (!member || !["superadmin", "super_admin", "platform_admin", "root"].includes(member.role.toLowerCase())) {
    throw new GmailError("El piloto de Gmail requiere superadmin", 403);
  }
  if (request) {
    if (request.headers.get("x-tenant-context") !== tenant.id) throw new GmailError("Cambió la empresa activa. Recarga la página", 409);
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = gmailConfig().origin;
      if (request.headers.get("origin") !== origin || new URL(request.url).origin !== origin) throw new GmailError("Origen no autorizado", 403);
    }
    if (!enforceRateLimit(`gmail:${request.method}:${tenant.id}:${tenant.userId}`, request.method === "GET" ? 40 : 12, 60_000).allowed) {
      throw new GmailError("Demasiadas consultas. Intenta en un minuto", 429);
    }
  }
  return { tenantId: tenant.id, actorId: tenant.userId };
}
export async function authorizeGmailTarget(request: Request, opportunityId: string): Promise<GmailTarget> {
  const actor = await authorizeGmail(request);
  if (!opportunityId || opportunityId.length > 200) throw new GmailError("Oportunidad no encontrada", 404);
  const row = await prisma.opportunities.findFirst({ where: { tenant_id: actor.tenantId, opportunity_id: opportunityId },
    select: { client_id: true } });
  if (!row?.client_id) throw new GmailError("La oportunidad necesita un cliente de esta empresa", 404);
  return { ...actor, opportunityId, clientId: row.client_id };
}
export function gmailFailure(error: unknown) {
  return NextResponse.json({ error: error instanceof GmailError ? error.message : "No se pudo completar la consulta de Gmail" },
    { status: error instanceof GmailError ? error.status : 503,
      headers: { "Cache-Control": "no-store", ...(error instanceof GmailError && error.status === 429 ? { "Retry-After": "60" } : {}) } });
}
