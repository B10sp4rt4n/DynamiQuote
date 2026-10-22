import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
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
const inputMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/quote-input", async () => ({ createDraftFromQuoteInput: inputMock, quoteInputHash: (v: unknown) => JSON.stringify(v).padEnd(64, "x").slice(0,64) }));

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
    prismaMock.$transaction.mockImplementation((cb) => cb(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([{ last_number: "9" }]);
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
    prismaMock.package.findFirst.mockResolvedValueOnce({
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

  it("no aplica una plantilla inexistente", async () => {
    prismaMock.package.findFirst.mockResolvedValue(null);
    expect(await insertPackageIntoQuote("t1", "p1", "q-v2", { operationId: "op" })).toBeNull();
    expect(inputMock).not.toHaveBeenCalled();
  });
  it("envia cantidades por partida al escritor comun y conserva el cargo fijo", async () => {
    prismaMock.package.findFirst.mockResolvedValue({ active: true, name: "Base", package_id: "p1",
      created_at: new Date(), lines: [
        { line_id: "l1", line_order: 0, sku: "ENDPOINT", description: "Licencia", quantity: 1, cost_unit: 10, price_unit: 20, classification1: "product" },
        { line_id: "l2", line_order: 1, sku: "SETUP", description: "Instalacion", quantity: 1, cost_unit: 30, price_unit: 50, classification1: "service" },
      ] });
    inputMock.mockResolvedValue({ quote: { quoteId: "q-v3" }, replayed: false });
    const result = await insertPackageIntoQuote("t1", "p1", "q-v2", { operationId: "op", quantities: [{ lineId: "l1", quantity: 21 }] });
    expect(result?.inserted).toBe(2);
    expect(inputMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", quoteId: "q-v2", mode: "append", lines: [
      expect.objectContaining({ sku: "ENDPOINT", quantity: 21 }), expect.objectContaining({ sku: "SETUP", quantity: 1 }),
    ] }));
    await expect(insertPackageIntoQuote("t1", "p1", "q-v2", { operationId: "op", expectedRevision: "stale" })).rejects.toThrow("cambió");
    await expect(insertPackageIntoQuote("t1", "p1", "q-v2", { operationId: "op", quantities: [{ lineId: "foreign", quantity: 2 }] })).rejects.toThrow("ajenas");
  });
});
