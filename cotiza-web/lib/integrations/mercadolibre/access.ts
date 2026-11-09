import "server-only";
import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { mercadoLibreConfig, MercadoLibreError } from "./config";
import { mercadoLibreEnabled } from "./availability";

export async function authorizeMercadoLibre(request?: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant || tenant.authMode !== "clerk" || !tenant.userId) throw new MercadoLibreError("Inicia sesión para administrar la integración", 401);
  if (!await mercadoLibreEnabled(tenant.id)) throw new MercadoLibreError("Integración no habilitada para esta empresa", 404);
  // Verify authoritative membership/role; never elevate a claim or bootstrap identity.
  const member = await prisma.app_users.findFirst({ where: { user_id: tenant.userId, active: true },
    select: { tenant_id: true, role: true } });
  const global = member && ["superadmin", "super_admin", "platform_admin", "root"].includes(member.role);
  if (!member || (!global && (member.tenant_id !== tenant.id || !["owner", "admin"].includes(member.role)))) {
    throw new MercadoLibreError("Se requiere administración de la empresa", 403);
  }
  if (request && !["GET", "HEAD"].includes(request.method)) {
    const origin = mercadoLibreConfig().origin;
    if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin) {
      throw new MercadoLibreError("Origen no autorizado", 403);
    }
  }
  return { tenantId: tenant.id, actorId: tenant.userId, tenantName: tenant.name };
}

export function mercadoLibreFailure(error: unknown) {
  return NextResponse.json({ error: error instanceof MercadoLibreError ? error.message : "No se pudo completar la operación de Mercado Libre" },
    { status: error instanceof MercadoLibreError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
