import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { createLogoProfileByTenant, getIssuerProfilesByTenant } from "@/lib/db/settings";

export async function GET(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedType = searchParams.get("type");
  const logoType = requestedType === "issuer" || requestedType === "client" ? requestedType : undefined;

  const profiles = await getIssuerProfilesByTenant(tenant.id, logoType);
  return NextResponse.json({ profiles });
}

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const formData = await request.formData();
  const logoFile = formData.get("logoFile");
  const logoName = String(formData.get("logoName") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const logoTypeRaw = String(formData.get("logoType") ?? "").trim().toLowerCase();
  const isDefault = String(formData.get("isDefault") ?? "").trim() === "true";

  const logoType = logoTypeRaw === "issuer" || logoTypeRaw === "client" ? logoTypeRaw : null;
  if (!logoType) {
    return NextResponse.json({ error: "Tipo de logo inválido" }, { status: 422 });
  }

  if (!(logoFile instanceof File) || logoFile.size === 0) {
    return NextResponse.json({ error: "Debes seleccionar un archivo de logo" }, { status: 422 });
  }

  if (logoFile.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "El archivo excede el límite de 4MB" }, { status: 422 });
  }

  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
  if (!allowed.includes(logoFile.type)) {
    return NextResponse.json({ error: "Formato no soportado. Usa PNG, JPG, WEBP o SVG." }, { status: 422 });
  }

  const derivedFormat = logoFile.type === "image/svg+xml"
    ? "svg+xml"
    : logoFile.type.replace("image/", "");

  const raw = await logoFile.arrayBuffer();
  const bytes = new Uint8Array(raw);
  const profile = await createLogoProfileByTenant({
    companyName: companyName || null,
    isDefault,
    logoBytes: bytes,
    logoFormat: derivedFormat,
    logoName: logoName || logoFile.name,
    logoType,
    tenantId: tenant.id,
  });

  return NextResponse.json({ profile }, { status: 201 });
}
