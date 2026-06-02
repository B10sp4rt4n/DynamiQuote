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