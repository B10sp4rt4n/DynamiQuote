import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getIssuerProfileLogoByTenant, setDefaultIssuerProfileByTenant } from "@/lib/db/settings";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

type RouteContext = { params: Promise<{ logoId: string }> };

function resolveLogoMimeType(format: string): string {
  const normalized = format.trim().toLowerCase();

  if (normalized === "svg" || normalized === "svg+xml") {
    return "image/svg+xml";
  }

  return `image/${normalized || "png"}`;
}

export async function GET(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { logoId } = await context.params;
  const asset = await getIssuerProfileLogoByTenant(tenant.id, logoId);

  if (!asset) {
    return NextResponse.json({ error: "Logo no encontrado" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.logoBytes), {
    headers: {
      "Cache-Control": "private, max-age=600",
      "Content-Disposition": `inline; filename="${asset.logoName}"`,
      "Content-Type": resolveLogoMimeType(asset.logoFormat),
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const identity = getRequestIdentity(request, tenant.id);
  const rl = enforceRateLimit(`settings:issuer:${tenant.id}:${identity}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() }, status: 429 },
    );
  }

  const { logoId } = await context.params;
  const updated = await setDefaultIssuerProfileByTenant(tenant.id, logoId);
  if (!updated) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  return NextResponse.json({ profile: updated });
}
