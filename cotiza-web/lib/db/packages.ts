import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { createDraftFromQuoteInput, quoteInputHash } from "@/lib/db/quote-input";
import { normalizeQuoteInput, QuoteInputError } from "@/lib/domain/quote-input";

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
  revision: string;
  sourceQuoteVersion: number | null;
};

// ---------------------------------------------------------------------------
// Identidad de paquete; numeración global según la restricción existente
// ---------------------------------------------------------------------------

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
      source_metadata: true,
      created_at: true,
      description: true,
      lines: {
        orderBy: [{ line_order: "asc" }, { line_id: "asc" }],
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
    revision: quoteInputHash({ name: pkg.name, active: pkg.active, lines: pkg.lines }),
    sourceQuoteVersion: (pkg.source_metadata as Record<string, unknown> | null)?.sourceQuoteVersion as number ?? null,
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
  const packageId = await prisma.$transaction((tx) => persistPackage(tx, tenantId, input));
  return (await getPackageDetailByTenant(tenantId, packageId))!;
}

async function persistPackage(
  tx: Prisma.TransactionClient, tenantId: string, input: CreatePackageInput,
  sourceMetadata?: Prisma.InputJsonObject,
) {
  const normalized = normalizeQuoteInput(input.lines.map((l) => ({
    sku: l.sku ?? "", description: l.description, quantity: l.quantity,
    costUnit: l.costUnit, priceUnit: l.priceUnit,
    lineType: l.classification1 === "service" ? "service" : "product",
    serviceOrigin: l.classification2 ?? "",
  })));
  // pkg_number is globally unique in the existing schema. Lock and allocate
  // globally; a per-tenant counter collided on the second tenant's PKG-0001.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'package-number'}, 0))`;
  const [counter] = await tx.$queryRaw<Array<{ last_number: string }>>`
    SELECT coalesce(max(substring(pkg_number from '^PKG-([0-9]+)$')::numeric), 0)::text AS last_number FROM packages
  `;
  const next = Number(counter.last_number) + 1;
  if (!Number.isSafeInteger(next)) throw new QuoteInputError("No se pudo asignar el número de plantilla.");
  const packageId = randomUUID();
  const now = new Date();
  await tx.package.create({ data: {
    package_id: packageId, tenant_id: tenantId, pkg_number: `PKG-${String(next).padStart(4, "0")}`,
    active: true, created_at: now, updated_at: now, created_by: input.createdBy ?? null,
    name: input.name, description: input.description ?? null, playbook_tag: input.playbookTag ?? null,
    ...(sourceMetadata ? { source_metadata: sourceMetadata } : {}),
    lines: { create: normalized.lines.map((l, i) => ({
      line_id: randomUUID(), tenant_id: tenantId, line_order: i, sku: l.sku || null,
      description: l.description, quantity: l.quantity, cost_unit: l.costUnit, price_unit: l.priceUnit,
      margin_pct: l.marginPct, classification1: l.lineType, classification2: l.serviceOrigin || null,
    })) },
  } });
  return packageId;
}

export async function createPackageFromQuote(tenantId: string, actorId: string | null, input: {
  quoteId: string; name: string; description?: string; playbookTag?: string; operationId: string;
}) {
  const requestHash = quoteInputHash(input);
  const packageId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`template-save:${tenantId}:${input.operationId}`}, 0))`;
    const prior = await tx.package.findFirst({ where: {
      tenant_id: tenantId, source_metadata: { path: ["operationId"], equals: input.operationId },
    } });
    if (prior) {
      if ((prior.source_metadata as Record<string, unknown> | null)?.requestHash !== requestHash) {
        throw new QuoteInputError("La solicitud ya fue utilizada con datos distintos.", 409);
      }
      return prior.package_id;
    }
    const quote = await tx.quote.findFirst({ where: { quote_id: input.quoteId, tenantId } });
    if (!quote) return null;
    const lines = await tx.quote_lines.findMany({ where: { quote_id: quote.quote_id },
      orderBy: [{ created_at: "asc" }, { line_id: "asc" }] });
    if (lines.length > 200) throw new QuoteInputError("Una plantilla admite hasta 200 partidas.");
    // Copy only the offer lines, never client/contact, proposal or tax identity.
    return persistPackage(tx, tenantId, {
      name: input.name, description: input.description, playbookTag: input.playbookTag,
      createdBy: actorId ?? undefined, lines: lines.map((l) => ({
        sku: l.sku ?? "", description: l.description_final ?? l.description_original ?? "Sin descripción",
        quantity: Number(l.quantity ?? 1), costUnit: Number(l.cost_unit ?? 0), priceUnit: Number(l.final_price_unit ?? 0),
        classification1: l.line_type === "service" ? "service" : "product", classification2: l.service_origin ?? "",
      })),
    }, { contractVersion: 1, sourceQuoteId: quote.quote_id, sourceQuoteVersion: quote.version ?? 1,
      operationId: input.operationId, requestHash, capturedAt: new Date().toISOString() });
  });
  return packageId ? getPackageDetailByTenant(tenantId, packageId) : null;
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
  tenantId: string, packageId: string, quoteId: string,
  options: { operationId: string; expectedRevision?: string; quantities?: Array<{ lineId: string; quantity: number }> },
) {
  const pkg = await getPackageDetailByTenant(tenantId, packageId);
  if (!pkg || !pkg.active) return null;
  if (options.expectedRevision && options.expectedRevision !== pkg.revision) {
    throw new QuoteInputError("La plantilla cambió. Vuelve a abrirla para revisar sus valores.", 409);
  }
  const quantities = new Map(options.quantities?.map((q) => [q.lineId, q.quantity]));
  if (quantities.size !== (options.quantities?.length ?? 0) || [...quantities.keys()].some((id) => !pkg.lines.some((l) => l.lineId === id))) {
    throw new QuoteInputError("Hay cantidades repetidas o partidas ajenas a la plantilla.");
  }
  const result = await createDraftFromQuoteInput({ tenantId, quoteId, operationId: options.operationId,
    mode: "append", source: { kind: "template", id: packageId, revision: pkg.revision },
    lines: pkg.lines.map((l) => ({ sku: l.sku ?? "", description: l.description,
      quantity: quantities.get(l.lineId) ?? l.quantity, costUnit: l.costUnit, priceUnit: l.priceUnit,
      lineType: l.classification1 === "service" ? "service" : "product", serviceOrigin: l.classification2 ?? "" })),
  });
  return result ? { ...result, inserted: pkg.lines.length } : null;
}
