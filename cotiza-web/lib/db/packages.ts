import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type PackageLineSummary = {
  classification1: string | null;
  classification2: string | null;
  costUnit: number;
  description: string;
  lineId: string;
  lineOrder: number;
  marginPct: number | null;
  priceUnit: number;
  quantity: number;
  sku: string | null;
};

export type PackageSummary = {
  active: boolean;
  createdAt: string;
  description: string | null;
  lineCount: number;
  name: string;
  packageId: string;
  pkgNumber: string;
  playbookTag: string | null;
};

export type PackageDetail = PackageSummary & {
  lines: PackageLineSummary[];
};

// ---------------------------------------------------------------------------
// Consecutivo PKG-XXXX por tenant
// ---------------------------------------------------------------------------

async function nextPkgNumber(tenantId: string): Promise<string> {
  const last = await prisma.package.findFirst({
    orderBy: { pkg_number: "desc" },
    select: { pkg_number: true },
    where: { tenant_id: tenantId },
  });
  const lastNum = last ? parseInt(last.pkg_number.replace("PKG-", ""), 10) : 0;
  const next = String(lastNum + 1).padStart(4, "0");
  return `PKG-${next}`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getPackagesSummaryByTenant(tenantId: string): Promise<PackageSummary[]> {
  const rows = await prisma.package.findMany({
    orderBy: { created_at: "desc" },
    select: {
      active: true,
      created_at: true,
      description: true,
      lines: { select: { line_id: true } },
      name: true,
      package_id: true,
      pkg_number: true,
      playbook_tag: true,
    },
    where: { tenant_id: tenantId },
  });

  return rows.map((r) => ({
    active: r.active,
    createdAt: r.created_at.toISOString(),
    description: r.description,
    lineCount: r.lines.length,
    name: r.name,
    packageId: r.package_id,
    pkgNumber: r.pkg_number,
    playbookTag: r.playbook_tag,
  }));
}

export async function getPackageDetailByTenant(
  tenantId: string,
  packageId: string,
): Promise<PackageDetail | null> {
  const pkg = await prisma.package.findFirst({
    select: {
      active: true,
      created_at: true,
      description: true,
      lines: {
        orderBy: { line_order: "asc" },
        select: {
          classification1: true,
          classification2: true,
          cost_unit: true,
          description: true,
          line_id: true,
          line_order: true,
          margin_pct: true,
          price_unit: true,
          quantity: true,
          sku: true,
        },
      },
      name: true,
      package_id: true,
      pkg_number: true,
      playbook_tag: true,
    },
    where: { package_id: packageId, tenant_id: tenantId },
  });

  if (!pkg) return null;

  return {
    active: pkg.active,
    createdAt: pkg.created_at.toISOString(),
    description: pkg.description,
    lineCount: pkg.lines.length,
    lines: pkg.lines.map((l) => ({
      classification1: l.classification1,
      classification2: l.classification2,
      costUnit: Number(l.cost_unit),
      description: l.description,
      lineId: l.line_id,
      lineOrder: l.line_order,
      marginPct: l.margin_pct !== null ? Number(l.margin_pct) : null,
      priceUnit: Number(l.price_unit),
      quantity: Number(l.quantity),
      sku: l.sku,
    })),
    name: pkg.name,
    packageId: pkg.package_id,
    pkgNumber: pkg.pkg_number,
    playbookTag: pkg.playbook_tag,
  };
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

export type CreatePackageInput = {
  createdBy?: string;
  description?: string;
  lines: Array<{
    classification1?: string;
    classification2?: string;
    costUnit: number;
    description: string;
    marginPct?: number;
    priceUnit: number;
    quantity: number;
    sku?: string;
  }>;
  name: string;
  playbookTag?: string;
};

export async function createPackageForTenant(
  tenantId: string,
  input: CreatePackageInput,
): Promise<PackageDetail> {
  const pkgNumber = await nextPkgNumber(tenantId);
  const packageId = randomUUID();
  const now = new Date();

  await prisma.package.create({
    data: {
      active: true,
      created_at: now,
      created_by: input.createdBy,
      description: input.description ?? null,
      lines: {
        create: input.lines.map((l, i) => ({
          classification1: l.classification1 ?? null,
          classification2: l.classification2 ?? null,
          cost_unit: l.costUnit,
          description: l.description,
          line_id: randomUUID(),
          line_order: i,
          margin_pct: l.marginPct ?? null,
          price_unit: l.priceUnit,
          quantity: l.quantity,
          sku: l.sku ?? null,
          tenant_id: tenantId,
        })),
      },
      name: input.name,
      package_id: packageId,
      pkg_number: pkgNumber,
      playbook_tag: input.playbookTag ?? null,
      tenant_id: tenantId,
      updated_at: now,
    },
  });

  const detail = await getPackageDetailByTenant(tenantId, packageId);
  return detail!;
}

export async function updatePackageMetaForTenant(
  tenantId: string,
  packageId: string,
  patch: { description?: string; name?: string; playbookTag?: string },
): Promise<PackageSummary | null> {
  const pkg = await prisma.package.findFirst({
    select: { package_id: true },
    where: { package_id: packageId, tenant_id: tenantId },
  });
  if (!pkg) return null;

  const updated = await prisma.package.update({
    data: {
      description: patch.description,
      name: patch.name,
      playbook_tag: patch.playbookTag,
      updated_at: new Date(),
    },
    select: {
      active: true,
      created_at: true,
      description: true,
      lines: { select: { line_id: true } },
      name: true,
      package_id: true,
      pkg_number: true,
      playbook_tag: true,
    },
    where: { package_id: packageId },
  });

  return {
    active: updated.active,
    createdAt: updated.created_at.toISOString(),
    description: updated.description,
    lineCount: updated.lines.length,
    name: updated.name,
    packageId: updated.package_id,
    pkgNumber: updated.pkg_number,
    playbookTag: updated.playbook_tag,
  };
}

export async function togglePackageActiveForTenant(
  tenantId: string,
  packageId: string,
): Promise<boolean | null> {
  const pkg = await prisma.package.findFirst({
    select: { active: true },
    where: { package_id: packageId, tenant_id: tenantId },
  });
  if (!pkg) return null;

  const updated = await prisma.package.update({
    data: { active: !pkg.active, updated_at: new Date() },
    select: { active: true },
    where: { package_id: packageId },
  });
  return updated.active;
}

// ---------------------------------------------------------------------------
// Insertar paquete en cotización (copia las líneas — no referencia viva)
// ---------------------------------------------------------------------------

export async function insertPackageIntoQuote(
  tenantId: string,
  packageId: string,
  quoteId: string,
): Promise<number> {
  const pkg = await prisma.package.findFirst({
    select: {
      lines: {
        orderBy: { line_order: "asc" },
        select: {
          classification1: true,
          classification2: true,
          cost_unit: true,
          description: true,
          margin_pct: true,
          price_unit: true,
          quantity: true,
          sku: true,
        },
      },
      tenant_id: true,
    },
    where: { active: true, package_id: packageId, tenant_id: tenantId },
  });

  if (!pkg) return 0;

  // Verificar que la cotización pertenece al mismo tenant
  const quote = await prisma.quote.findFirst({
    select: { quote_id: true },
    where: { quote_id: quoteId, tenantId: tenantId },
  });
  if (!quote) return 0;

  const now = new Date();
  await prisma.quote_lines.createMany({
    data: pkg.lines.map((l) => ({
      classification1: l.classification1,
      classification2: l.classification2,
      cost_unit: l.cost_unit,
      created_at: now,
      description_final: l.description,
      description_original: l.description,
      gross_profit: Number(l.price_unit) - Number(l.cost_unit),
      line_id: randomUUID(),
      margin_pct: l.margin_pct,
      price_unit: l.price_unit,
      quantity: l.quantity,
      quote_id: quoteId,
      sku: l.sku,
      tenant_id: tenantId,
    })),
  });

  return pkg.lines.length;
}
