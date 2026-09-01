import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  deleteLogoProfileByTenant,
  getIssuerProfileLogoByTenant,
  setDefaultIssuerProfileByTenant,
  updateLogoProfileByTenant,
} from "@/lib/db/settings";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

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

  // Marcar como default (click sin body) vs editar nombre/empresa/archivo
  // (envia multipart/form-data) -- mismo endpoint, dos acciones distintas
  // segun la forma del request.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const updated = await setDefaultIssuerProfileByTenant(tenant.id, logoId);
    if (!updated) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

    return NextResponse.json({ profile: updated });
  }

  const formData = await request.formData();
  const logoFile = formData.get("logoFile");
  const hasLogoName = formData.has("logoName");
  const hasCompanyName = formData.has("companyName");
  const logoName = String(formData.get("logoName") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();

  if (logoFile instanceof File && logoFile.size > 0) {
    if (logoFile.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: "El archivo excede el límite de 4MB" }, { status: 422 });
    }

    if (!ALLOWED_LOGO_MIME_TYPES.includes(logoFile.type)) {
      return NextResponse.json({ error: "Formato no soportado. Usa PNG, JPG, WEBP o SVG." }, { status: 422 });
    }
  }

  const derivedFormat =
    logoFile instanceof File && logoFile.size > 0
      ? logoFile.type === "image/svg+xml"
        ? "svg+xml"
        : logoFile.type.replace("image/", "")
      : undefined;

  const logoBytes =
    logoFile instanceof File && logoFile.size > 0 ? new Uint8Array(await logoFile.arrayBuffer()) : undefined;

  const updated = await updateLogoProfileByTenant(tenant.id, logoId, {
    ...(hasCompanyName ? { companyName: companyName || null } : {}),
    ...(hasLogoName && logoName ? { logoName } : {}),
    ...(logoBytes !== undefined ? { logoBytes } : {}),
    ...(derivedFormat !== undefined ? { logoFormat: derivedFormat } : {}),
  });

  if (!updated) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  return NextResponse.json({ profile: updated });
}

export async function DELETE(request: Request, context: RouteContext) {
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
  const result = await deleteLogoProfileByTenant(tenant.id, logoId);

  if (result === "not_found") {
    return NextResponse.json({ error: "Logo no encontrado" }, { status: 404 });
  }

  if (result === "in_use") {
    return NextResponse.json(
      { error: "Este logo ya se usó en una propuesta formal y no se puede borrar" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
