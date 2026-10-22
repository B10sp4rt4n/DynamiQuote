import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { recordTenantContextChange } from "@/lib/db/tenant-context-audit";

const TENANT_OVERRIDE_COOKIE = "tenant_override_slug";

export async function POST(request: Request) {
  const context = await getCurrentTenantContext();
  if (!context?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!context.isSuperAdmin) return NextResponse.json({ error: "Sin permisos para cambiar de empresa" }, { status: 403 });

  const payload: unknown = await request.json().catch(() => null);
  const slug = payload && typeof payload === "object" && "slug" in payload && typeof payload.slug === "string"
    ? payload.slug.trim() : null;
  if (!slug) return NextResponse.json({ error: "Debes indicar slug" }, { status: 422 });

  const tenant = await prisma.tenant.findFirst({ select: { slug: true, tenant_id: true }, where: { active: true, slug } });
  if (!tenant) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  await recordTenantContextChange(context.userId, context.id, tenant.tenant_id);
  const response = NextResponse.json({ ok: true, slug: tenant.slug }, { status: 200 });
  response.cookies.set({ httpOnly: true, maxAge: 60 * 60 * 8, name: TENANT_OVERRIDE_COOKIE,
    path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", value: tenant.slug });
  return response;
}

export async function DELETE() {
  const context = await getCurrentTenantContext();
  if (!context?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!context.isSuperAdmin) return NextResponse.json({ error: "Sin permisos para cambiar de empresa" }, { status: 403 });

  const user = await prisma.app_users.findUnique({ where: { user_id: context.userId }, select: { tenant_id: true } });
  const home = user?.tenant_id ? await prisma.tenant.findFirst({
    where: { tenant_id: user.tenant_id, active: true }, select: { tenant_id: true },
  }) : null;
  if (!home) return NextResponse.json({ error: "Empresa de origen no disponible" }, { status: 404 });

  await recordTenantContextChange(context.userId, context.id, home.tenant_id);
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set({ expires: new Date(0), httpOnly: true, name: TENANT_OVERRIDE_COOKIE,
    path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", value: "" });
  return response;
}
