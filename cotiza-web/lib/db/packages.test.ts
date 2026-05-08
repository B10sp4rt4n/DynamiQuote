import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  package: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  quote: {
    findFirst: vi.fn(),
  },
  quote_lines: {
    createMany: vi.fn(),
  },
}));

const randomUUIDMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomUUID: randomUUIDMock,
  };
});

import {
  createPackageForTenant,
  getPackageDetailByTenant,
  getPackagesSummaryByTenant,
  insertPackageIntoQuote,
  togglePackageActiveForTenant,
  updatePackageMetaForTenant,
} from "@/lib/db/packages";

describe("lib/db/packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    randomUUIDMock.mockReturnValue("uuid-1");
  });

  it("getPackagesSummaryByTenant mapea resultados", async () => {
    prismaMock.package.findMany.mockResolvedValue([
      {
        active: true,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        description: "Base",
        lines: [{ line_id: "l1" }, { line_id: "l2" }],
        name: "Paquete 1",
        package_id: "pkg-1",
        pkg_number: "PKG-0001",
        playbook_tag: "limpieza",
      },
    ]);

    const result = await getPackagesSummaryByTenant("tenant-1");

    expect(prismaMock.package.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenant_id: "tenant-1" } }),
    );
    expect(result).toEqual([
      {
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        description: "Base",
        lineCount: 2,
        name: "Paquete 1",
        packageId: "pkg-1",
        pkgNumber: "PKG-0001",
        playbookTag: "limpieza",
      },
    ]);
  });

  it("getPackageDetailByTenant devuelve null cuando no existe", async () => {
    prismaMock.package.findFirst.mockResolvedValue(null);

    const result = await getPackageDetailByTenant("tenant-1", "pkg-1");

    expect(result).toBeNull();
  });

  it("getPackageDetailByTenant convierte campos numericos", async () => {
    prismaMock.package.findFirst.mockResolvedValue({
      active: true,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      description: "Demo",
      lines: [
        {
          classification1: "product",
          classification2: "equipo",
          cost_unit: "10.5",
          description: "Linea 1",
          line_id: "l1",
          line_order: 0,
          margin_pct: "20",
          price_unit: "12.6",
          quantity: "3",
          sku: "SKU1",
        },
      ],
      name: "Paquete",
      package_id: "pkg-1",
      pkg_number: "PKG-0001",
      playbook_tag: null,
    });

    const result = await getPackageDetailByTenant("tenant-1", "pkg-1");

    expect(result?.lineCount).toBe(1);
    expect(result?.lines[0]).toMatchObject({
      costUnit: 10.5,
      marginPct: 20,
      priceUnit: 12.6,
      quantity: 3,
    });
  });

  it("createPackageForTenant crea package y devuelve detalle", async () => {
    prismaMock.package.findFirst
      .mockResolvedValueOnce({ pkg_number: "PKG-0009" })
      .mockResolvedValueOnce({
        active: true,
        created_at: new Date("2026-01-10T00:00:00.000Z"),
        description: "Desc",
        lines: [],
        name: "Nuevo",
        package_id: "uuid-1",
        pkg_number: "PKG-0010",
        playbook_tag: "tag",
      });
    prismaMock.package.create.mockResolvedValue({});

    const result = await createPackageForTenant("tenant-1", {
      description: "Desc",
      lines: [{ costUnit: 10, description: "L1", priceUnit: 20, quantity: 1 }],
      name: "Nuevo",
      playbookTag: "tag",
    });

    expect(prismaMock.package.create).toHaveBeenCalled();
    expect(result).toMatchObject({
      name: "Nuevo",
      packageId: "uuid-1",
      pkgNumber: "PKG-0010",
    });
  });

  it("updatePackageMetaForTenant devuelve null si no existe", async () => {
    prismaMock.package.findFirst.mockResolvedValue(null);

    const result = await updatePackageMetaForTenant("tenant-1", "pkg-1", {
      name: "Nuevo",
    });

    expect(result).toBeNull();
    expect(prismaMock.package.update).not.toHaveBeenCalled();
  });

  it("togglePackageActiveForTenant alterna estado", async () => {
    prismaMock.package.findFirst.mockResolvedValue({ active: true });
    prismaMock.package.update.mockResolvedValue({ active: false });

    const result = await togglePackageActiveForTenant("tenant-1", "pkg-1");

    expect(result).toBe(false);
    expect(prismaMock.package.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
  });

  it("insertPackageIntoQuote devuelve 0 si package no existe", async () => {
    prismaMock.package.findFirst.mockResolvedValue(null);

    const inserted = await insertPackageIntoQuote("tenant-1", "pkg-1", "quote-1");

    expect(inserted).toBe(0);
    expect(prismaMock.quote_lines.createMany).not.toHaveBeenCalled();
  });

  it("insertPackageIntoQuote copia lineas y devuelve cantidad", async () => {
    prismaMock.package.findFirst.mockResolvedValue({
      lines: [
        {
          classification1: "product",
          classification2: "equipo",
          cost_unit: 10,
          description: "L1",
          margin_pct: 20,
          price_unit: 12,
          quantity: 2,
          sku: "SKU1",
        },
        {
          classification1: "service",
          classification2: null,
          cost_unit: 30,
          description: "L2",
          margin_pct: 25,
          price_unit: 40,
          quantity: 1,
          sku: "SKU2",
        },
      ],
      tenant_id: "tenant-1",
    });
    prismaMock.quote.findFirst.mockResolvedValue({ quote_id: "quote-1" });
    randomUUIDMock.mockReturnValueOnce("line-1").mockReturnValueOnce("line-2");

    const inserted = await insertPackageIntoQuote("tenant-1", "pkg-1", "quote-1");

    expect(inserted).toBe(2);
    expect(prismaMock.quote_lines.createMany).toHaveBeenCalledTimes(1);
    const payload = prismaMock.quote_lines.createMany.mock.calls[0][0] as {
      data: Array<{ gross_profit: number; line_id: string }>;
    };
    expect(payload.data).toHaveLength(2);
    expect(payload.data[0]).toMatchObject({ gross_profit: 2, line_id: "line-1" });
    expect(payload.data[1]).toMatchObject({ gross_profit: 10, line_id: "line-2" });
  });
});
