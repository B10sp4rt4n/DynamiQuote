import { describe, expect, it } from "vitest";

import {
  createPackageSchema,
  insertPackageIntoQuoteSchema,
  packageLineInputSchema,
  updatePackageMetaSchema,
} from "@/lib/validations/packages";

describe("packageLineInputSchema", () => {
  const base = {
    costUnit: 100,
    description: "Servicio de limpieza mensual",
    priceUnit: 150,
    quantity: 2,
  };

  it("acepta una linea valida minima", () => {
    expect(packageLineInputSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza costo negativo", () => {
    expect(packageLineInputSchema.safeParse({ ...base, costUnit: -1 }).success).toBe(false);
  });

  it("rechaza cantidad no positiva", () => {
    expect(packageLineInputSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
  });

  it("rechaza margen fuera de rango", () => {
    expect(packageLineInputSchema.safeParse({ ...base, marginPct: 120 }).success).toBe(false);
    expect(packageLineInputSchema.safeParse({ ...base, marginPct: -120 }).success).toBe(false);
  });
});

describe("createPackageSchema", () => {
  const validLine = {
    costUnit: 100,
    description: "Partida",
    priceUnit: 130,
    quantity: 1,
  };

  it("acepta payload valido", () => {
    const result = createPackageSchema.safeParse({
      lines: [validLine],
      name: "Paquete Basico",
      playbookTag: "limpieza-industrial",
    });

    expect(result.success).toBe(true);
  });

  it("rechaza sin lineas", () => {
    const result = createPackageSchema.safeParse({
      lines: [],
      name: "Paquete vacio",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza mas de 200 lineas", () => {
    const result = createPackageSchema.safeParse({
      lines: Array.from({ length: 201 }, (_, i) => ({
        ...validLine,
        description: `Linea ${i + 1}`,
      })),
      name: "Paquete grande",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza nombre vacio", () => {
    const result = createPackageSchema.safeParse({
      lines: [validLine],
      name: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("updatePackageMetaSchema", () => {
  it("acepta patch parcial", () => {
    expect(updatePackageMetaSchema.safeParse({ name: "Nuevo nombre" }).success).toBe(true);
    expect(updatePackageMetaSchema.safeParse({ description: "Actualizada" }).success).toBe(true);
    expect(updatePackageMetaSchema.safeParse({ playbookTag: "tag-v2" }).success).toBe(true);
  });

  it("rechaza nombre vacio", () => {
    expect(updatePackageMetaSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("insertPackageIntoQuoteSchema", () => {
  it("acepta quoteId UUID valido", () => {
    const result = insertPackageIntoQuoteSchema.safeParse({
      quoteId: "8f71c0f5-5cc5-4de4-beb3-7da4c8f3e5ca",
    });

    expect(result.success).toBe(true);
  });

  it("rechaza quoteId invalido", () => {
    const result = insertPackageIntoQuoteSchema.safeParse({
      quoteId: "COT-0001",
    });

    expect(result.success).toBe(false);
  });
});
