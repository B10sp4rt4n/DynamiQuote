import "server-only";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
import { loomPilotVisible } from "./availability";
import { loomConfig } from "./config";
import { LoomError, type LoomTarget } from "./domain";

export async function authorizeLoom(request: Request, kind: "client" | "opportunity", id: string): Promise<LoomTarget> {
  const tenant = await getCurrentTenantContext();
  if (!tenant || tenant.authMode !== "clerk" || !tenant.userId) throw new LoomError("Inicia sesión para consultar Loom", 401);
  if (!await loomPilotVisible(tenant)) throw new LoomError("Piloto Loom no disponible", 404);
  const member = await prisma.app_users.findFirst({ where: { user_id: tenant.userId, active: true }, select: { role: true } });
  if (!member || !["superadmin", "super_admin", "platform_admin", "root"].includes(member.role.toLowerCase())) throw new LoomError("Piloto reservado a superadmin", 403);
  const config = loomConfig();
  if (config.tenantId !== tenant.id) throw new LoomError("Conexión de otra empresa", 403);
  if (request.headers.get("x-tenant-context") !== tenant.id) throw new LoomError("Cambió la empresa activa. Recarga el expediente", 409);
  if (request.method === "POST" && (request.headers.get("origin") !== config.origin || new URL(request.url).origin !== config.origin)) {
    throw new LoomError("Origen no autorizado", 403);
  }
  if (id.length > 200 || !id) throw new LoomError("Expediente no encontrado", 404);
  const opportunity = kind === "opportunity" ? await prisma.opportunities.findFirst({
    where: { tenant_id: tenant.id, opportunity_id: id }, select: { opportunity_id: true, client_id: true },
  }) : null;
  if (kind === "opportunity" && !opportunity) throw new LoomError("Oportunidad no encontrada", 404);
  const clientId = opportunity?.client_id ?? id;
  const client = await prisma.client.findFirst({ where: { tenant_id: tenant.id, client_id: clientId }, select: { client_id: true } });
  if (!client) throw new LoomError("Cliente no encontrado", 404);
  const limit = enforceRateLimit("loom:" + request.method + ":" + tenant.id + ":" + tenant.userId, request.method === "POST" ? 8 : 40, 60_000);
  if (!limit.allowed) throw new LoomError("Demasiadas consultas. Intenta en un minuto", 429, "60");
  return { tenantId: tenant.id, actorId: tenant.userId, connectionKey: config.connectionKey, clientId, opportunityId: opportunity?.opportunity_id ?? null };
}
