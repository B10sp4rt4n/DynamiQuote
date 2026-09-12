import "server-only";

import { prisma } from "@/lib/db/prisma";

export type BootstrapTenant = {
  id: string;
  name: string;
  slug: string;
};

export type ActiveTenantOption = {
  id: string;
  name: string;
  slug: string;
};

export type ClosingContactLevel = "contacto" | "contacto_correo" | "contacto_correo_telefono";

export type TenantProfile = {
  address: string | null;
  closingContactLabel: string | null;
  closingContactLevel: ClosingContactLevel;
  expiryAlertDaysBefore: number;
  name: string;
  razonSocial: string | null;
  rfc: string | null;
  website: string | null;
};

export type UpdateTenantProfileInput = {
  address?: string | null;
  closingContactLabel?: string | null;
  closingContactLevel?: ClosingContactLevel;
  expiryAlertDaysBefore?: number;
  razonSocial?: string | null;
  rfc?: string | null;
  website?: string | null;
};

function normalizeClosingContactLevel(value: string): ClosingContactLevel {
  return value === "contacto" || value === "contacto_correo" || value === "contacto_correo_telefono"
    ? value
    : "contacto_correo_telefono";
}

export async function getBootstrapTenant(): Promise<BootstrapTenant | null> {
  const slug = process.env["DEFAULT_TENANT_SLUG"];

  const tenant = slug
    ? await prisma.tenant.findUnique({
        where: { slug },
        select: {
          tenant_id: true,
          name: true,
          slug: true,
        },
      })
    : await prisma.tenant.findFirst({
        where: { active: true },
        orderBy: { created_at: "asc" },
        select: {
          tenant_id: true,
          name: true,
          slug: true,
        },
      });

  if (!tenant) {
    return null;
  }

  return {
    id: tenant.tenant_id,
    name: tenant.name,
    slug: tenant.slug,
  };
}

export async function getActiveTenants(): Promise<ActiveTenantOption[]> {
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    select: {
      tenant_id: true,
      name: true,
      slug: true,
    },
    where: {
      active: true,
    },
  });

  return tenants.map((tenant) => ({
    id: tenant.tenant_id,
    name: tenant.name,
    slug: tenant.slug,
  }));
}

// Datos fiscales del emisor (RFC, razon social, domicilio, sitio web) -- se
// muestran en el recuadro "Datos del emisor" del documento de propuesta. Sin
// backfill: nacen vacios hasta que owner/admin/superadmin los capture en
// Configuracion. `name` es el nombre comercial del tenant (no es lo mismo
// que la razon social fiscal, que puede ser distinta).
export async function getTenantProfileByTenant(tenantId: string): Promise<TenantProfile | null> {
  const tenant = await prisma.tenant.findFirst({
    select: {
      address: true,
      closing_contact_label: true,
      closing_contact_level: true,
      expiry_alert_days_before: true,
      name: true,
      razon_social: true,
      rfc: true,
      website: true,
    },
    where: { tenant_id: tenantId },
  });

  if (!tenant) {
    return null;
  }

  return {
    address: tenant.address,
    closingContactLabel: tenant.closing_contact_label,
    closingContactLevel: normalizeClosingContactLevel(tenant.closing_contact_level),
    expiryAlertDaysBefore: tenant.expiry_alert_days_before,
    name: tenant.name,
    razonSocial: tenant.razon_social,
    rfc: tenant.rfc,
    website: tenant.website,
  };
}

export async function updateTenantProfileByTenant(
  tenantId: string,
  input: UpdateTenantProfileInput,
): Promise<TenantProfile | null> {
  const existing = await prisma.tenant.findFirst({
    select: { tenant_id: true },
    where: { tenant_id: tenantId },
  });

  if (!existing) {
    return null;
  }

  const updated = await prisma.tenant.update({
    data: {
      ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
      ...(input.closingContactLabel !== undefined
        ? { closing_contact_label: input.closingContactLabel?.trim() || null }
        : {}),
      ...(input.closingContactLevel !== undefined
        ? { closing_contact_level: input.closingContactLevel }
        : {}),
      ...(input.expiryAlertDaysBefore !== undefined
        ? { expiry_alert_days_before: input.expiryAlertDaysBefore }
        : {}),
      ...(input.razonSocial !== undefined ? { razon_social: input.razonSocial?.trim() || null } : {}),
      ...(input.rfc !== undefined ? { rfc: input.rfc?.trim() || null } : {}),
      ...(input.website !== undefined ? { website: input.website?.trim() || null } : {}),
    },
    select: {
      address: true,
      closing_contact_label: true,
      closing_contact_level: true,
      expiry_alert_days_before: true,
      name: true,
      razon_social: true,
      rfc: true,
      website: true,
    },
    where: { tenant_id: tenantId },
  });

  return {
    address: updated.address,
    closingContactLabel: updated.closing_contact_label,
    closingContactLevel: normalizeClosingContactLevel(updated.closing_contact_level),
    expiryAlertDaysBefore: updated.expiry_alert_days_before,
    name: updated.name,
    razonSocial: updated.razon_social,
    rfc: updated.rfc,
    website: updated.website,
  };
}