import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";

const TENANT_OVERRIDE_COOKIE = "tenant_override_slug";
const DEV_CLERK_SESSION_COOKIE = "dev_clerk_client_session";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "No permitido en produccion" }, { status: 403 });
  }

  const { userId } = await auth();
  const hasDevClientSession =
    process.env.NODE_ENV === "development" &&
    request.headers.get("cookie")?.includes(`${DEV_CLERK_SESSION_COOKIE}=1`);

  if (!userId && !hasDevClientSession) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantContext = await getCurrentTenantContext();
  const canSwitchTenant =
    Boolean(tenantContext) &&
    (tenantContext.isSuperAdmin || tenantContext.isTenantPrimaryAdmin);

  if (!canSwitchTenant) {
    return NextResponse.json({ error: "Sin permisos para cambiar de empresa" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { slug?: string } | null;
  const slug = payload?.slug?.trim();

  if (!slug) {
    return NextResponse.json({ error: "Debes indicar slug" }, { status: 422 });
  }

  const tenant = await prisma.tenant.findFirst({
    select: { slug: true },
    where: {
      active: true,
      slug,
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true, slug: tenant.slug }, { status: 200 });

  response.cookies.set({
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    name: TENANT_OVERRIDE_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: false,
    value: tenant.slug,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true }, { status: 200 });

  response.cookies.set({
    expires: new Date(0),
    httpOnly: true,
    name: TENANT_OVERRIDE_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: false,
    value: "",
  });

  return response;
}
