import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

// Opt-in only, localhost only; ordinary unit tests never contact a database.
const enabled = process.env.COTIZA_TEMPLATE_INTEGRATION === "1";
describe.skipIf(!enabled)("template foundation against disposable PostgreSQL", () => {
  let prisma: typeof import("./prisma").prisma;
  let packages: typeof import("./packages");
  let input: typeof import("./quote-input");
  let quotes: typeof import("./quotes");
  const tenantId = `template-fixture-${randomUUID()}`;
  const otherTenant = `template-fixture-${randomUUID()}`;
  const sourceId = randomUUID(); const targetId = randomUUID();
  const opportunityId = randomUUID();
  let pkg: NonNullable<Awaited<ReturnType<typeof import("./packages").createPackageFromQuote>>>;
  let originalTarget: string;
  beforeAll(async () => {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    const local = host === "127.0.0.1" || host === "localhost";
    if (!local) throw new Error("Disposable localhost PostgreSQL required");
    ({ prisma } = await import("./prisma"));
    packages = await import("./packages"); input = await import("./quote-input"); quotes = await import("./quotes");
    for (const id of [tenantId, otherTenant]) await prisma.tenant.create({ data: { tenant_id: id, slug: id, name: "Template validation fixture", created_at: new Date() } });
    await prisma.opportunities.create({ data: { opportunity_id: opportunityId, opportunity_number: `OP-${randomUUID()}`, tenant_id: tenantId, title: "Fixture", created_at: new Date() } });
    for (const id of [sourceId, targetId]) await prisma.quote.create({ data: {
      quote_id: id, quote_group_id: id, tenantId, version: 1, createdAt: new Date(), status: "closed",
      client_name: "PRIVATE CLIENT NOT IN TEMPLATE", proposal_name: "Private proposal", opportunity_id: opportunityId,
      total_cost: id === sourceId ? 40 : 5, total_revenue: id === sourceId ? 70 : 10,
    } });
    await prisma.quote_lines.createMany({ data: [
      { line_id: randomUUID(), quote_id: sourceId, sku: "ENDPOINT", description_final: "Licencia", quantity: 1, cost_unit: 10, final_price_unit: 20, line_type: "product", created_at: new Date() },
      { line_id: randomUUID(), quote_id: sourceId, sku: "SETUP", description_final: "Implementación", quantity: 1, cost_unit: 30, final_price_unit: 50, line_type: "service", created_at: new Date(Date.now()+1) },
      { line_id: randomUUID(), quote_id: targetId, sku: "EXISTING", description_final: "Servicio existente", quantity: 1, cost_unit: 5, final_price_unit: 10, line_type: "service", created_at: new Date() },
    ] });
    originalTarget = JSON.stringify({ q: await prisma.quote.findUnique({ where: { quote_id: targetId } }), lines: await prisma.quote_lines.findMany({ where: { quote_id: targetId } }) });
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.$transaction(async (tx) => {
      await tx.quote_lines.deleteMany({ where: { quotes: { tenantId: { in: [tenantId, otherTenant] } } } });
      await tx.quote_search_index.deleteMany({ where: { quotes: { tenantId: { in: [tenantId, otherTenant] } } } });
      await tx.quote.deleteMany({ where: { tenantId: { in: [tenantId, otherTenant] } } });
      await tx.packageLine.deleteMany({ where: { tenant_id: { in: [tenantId, otherTenant] } } });
      await tx.package.deleteMany({ where: { tenant_id: { in: [tenantId, otherTenant] } } });
      await tx.opportunities.deleteMany({ where: { tenant_id: { in: [tenantId, otherTenant] } } });
      await tx.tenant.deleteMany({ where: { tenant_id: { in: [tenantId, otherTenant] } } });
    });
  });

  it("saves a frozen template without customer fields and replays creation safely", async () => {
    const request = { quoteId: sourceId, name: "Renovación anual fixture", operationId: randomUUID() };
    pkg = (await packages.createPackageFromQuote(tenantId, "fixture-actor", request))!;
    expect(pkg.lines).toHaveLength(2); expect(pkg.sourceQuoteVersion).toBe(1);
    expect(JSON.stringify(pkg)).not.toContain("PRIVATE CLIENT");
    expect((await packages.createPackageFromQuote(tenantId, "fixture-actor", request))?.packageId).toBe(pkg.packageId);
    await expect(packages.createPackageFromQuote(tenantId, "fixture-actor", { ...request, name: "Changed" })).rejects.toThrow("distintos");
    expect(await packages.createPackageFromQuote(otherTenant, "fixture-actor", { ...request, operationId: randomUUID() })).toBeNull();
  });
  it("applies variable quantities, recalculates and keeps the source version and opportunity", async () => {
    const endpoint = pkg.lines.find((l) => l.sku === "ENDPOINT")!;
    const options = { operationId: randomUUID(), expectedRevision: pkg.revision, quantities: [{ lineId: endpoint.lineId, quantity: 21 }] };
    const [a, b] = await Promise.all([
      packages.insertPackageIntoQuote(tenantId, pkg.packageId, targetId, options),
      packages.insertPackageIntoQuote(tenantId, pkg.packageId, targetId, options),
    ]);
    expect(a!.quote.quoteId).toBe(b!.quote.quoteId);
    expect(a!.quote.status).toBe("draft"); expect(a!.quote.version).toBe(2);
    expect(a!.totals).toEqual({ totalCost: 245, totalRevenue: 480, grossProfit: 235, avgMargin: 48.96 });
    expect(a!.lines.find((l) => l.sku === "SETUP")?.quantity).toBe(1);
    const created = await prisma.quote.findUniqueOrThrow({ where: { quote_id: a!.quote.quoteId } });
    expect(created.opportunity_id).toBe(opportunityId);
    expect(created.input_metadata).toMatchObject({ source: { kind: "template", id: pkg.packageId, revision: pkg.revision } });
    expect(await prisma.quote.count({ where: { tenantId, quote_group_id: targetId } })).toBe(2);
    expect(JSON.stringify({ q: await prisma.quote.findUnique({ where: { quote_id: targetId } }), lines: await prisma.quote_lines.findMany({ where: { quote_id: targetId } }) })).toBe(originalTarget);
    await expect(packages.insertPackageIntoQuote(tenantId, pkg.packageId, targetId, { ...options, quantities: [{ lineId: endpoint.lineId, quantity: 22 }] })).rejects.toThrow("distintos");
    // Versioned IDs are valid insertion targets too.
    const next = await packages.insertPackageIntoQuote(tenantId, pkg.packageId, a!.quote.quoteId, { operationId: randomUUID() });
    expect(next!.quote.version).toBe(3);
  });
  it("isolates tenants and rejects stale revisions or foreign line references", async () => {
    expect(await packages.insertPackageIntoQuote(otherTenant, pkg.packageId, targetId, { operationId: randomUUID() })).toBeNull();
    await expect(packages.insertPackageIntoQuote(tenantId, pkg.packageId, targetId, { operationId: randomUUID(), expectedRevision: "stale" })).rejects.toThrow("cambió");
    await expect(packages.insertPackageIntoQuote(tenantId, pkg.packageId, targetId, { operationId: randomUUID(), quantities: [{ lineId: "foreign", quantity: 1 }] })).rejects.toThrow("ajenas");
  });
  it("uses the same writer for Excel, preserves the old quote and replays imports", async () => {
    const operationId = randomUUID();
    const lines = [{ sku: "EXCEL", description: "Importado", quantity: 3, costUnit: 10, priceUnit: 15, lineType: "product" }];
    const a = await quotes.importQuoteLinesByTenant(tenantId, targetId, lines, operationId);
    const b = await quotes.importQuoteLinesByTenant(tenantId, targetId, lines, operationId);
    expect(a!.quoteId).toBe(b!.quoteId); expect(b!.replayed).toBe(true);
    const q = await prisma.quote.findUniqueOrThrow({ where: { quote_id: a!.quoteId } });
    expect(Number(q.total_revenue)).toBe(45); expect(Number(q.total_cost)).toBe(30);
    expect(q.input_metadata).toMatchObject({ source: { kind: "excel" } });
    expect(await prisma.quote_lines.count({ where: { quote_id: targetId } })).toBe(1);
  });
  it("rejects overflowing inputs before creating another version", async () => {
    const before = await prisma.quote.count({ where: { tenantId } });
    await expect(input.createDraftFromQuoteInput({ tenantId, quoteId: targetId, mode: "replace", operationId: randomUUID(), source: { kind: "excel" },
      lines: [{ sku: "", description: "Overflow", quantity: 99999999, costUnit: 99999999, priceUnit: 99999999, lineType: "product", serviceOrigin: "" }] })).rejects.toThrow("totales");
    expect(await prisma.quote.count({ where: { tenantId } })).toBe(before);
  });
  it("allocates distinct package numbers across tenants", async () => {
    const data = { name: "Fixture", lines: [{ description: "Servicio", quantity: 1, costUnit: 5, priceUnit: 10 }] };
    const [a, b] = await Promise.all([packages.createPackageForTenant(tenantId, data), packages.createPackageForTenant(otherTenant, data)]);
    expect(a.pkgNumber).not.toBe(b.pkgNumber);
  });
});
