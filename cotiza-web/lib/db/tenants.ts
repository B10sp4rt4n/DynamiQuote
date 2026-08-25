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

export type TenantProfile = {
  address: string | null;
  name: string;
  rfc: string | null;
  website: string | null;
};

export type UpdateTenantProfileInput = {
  address?: string | null;
  rfc?: string | null;
  website?: string | null;
};

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

// Datos fiscales del emisor (RFC, domicilio, sitio web) -- se muestran en el
// recuadro "Datos del emisor" del documento de propuesta. Sin backfill: nacen
// vacios hasta que owner/admin/superadmin los capture en Configuracion.
export async function getTenantProfileByTenant(tenantId: string): Promise<TenantProfile | null> {
  const tenant = await prisma.tenant.findFirst({
    select: {
      address: true,
      name: true,
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
    name: tenant.name,
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
      ...(input.rfc !== undefined ? { rfc: input.rfc?.trim() || null } : {}),
      ...(input.website !== undefined ? { website: input.website?.trim() || null } : {}),
    },
    select: {
      address: true,
      name: true,
      rfc: true,
      website: true,
    },
    where: { tenant_id: tenantId },
  });

  return {
    address: updated.address,
    name: updated.name,
    rfc: updated.rfc,
    website: updated.website,
  };
}