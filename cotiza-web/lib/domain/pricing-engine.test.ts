import { describe, expect, it } from "vitest";

import {
  calculateMarginFromPrice,
  calculatePriceFromMargin,
  resolveBidirectionalPricing,
} from "@/lib/domain/pricing-engine";

describe("calculatePriceFromMargin", () => {
  it("calcula precio correcto con margen 40%", () => {
    expect(calculatePriceFromMargin(60, 40)).toBeCloseTo(100, 2);
  });

  it("calcula precio con margen 0%", () => {
    expect(calculatePriceFromMargin(100, 0)).toBe(100);
  });

  it("calcula precio con margen 50%", () => {
    expect(calculatePriceFromMargin(50, 50)).toBeCloseTo(100, 2);
  });

  it("lanza error si margen >= 100", () => {
    expect(() => calculatePriceFromMargin(100, 100)).toThrow();
  });

  it("lanza error si margen > 100", () => {
    expect(() => calculatePriceFromMargin(100, 110)).toThrow();
  });
});

describe("calculateMarginFromPrice", () => {
  it("calcula margen correcto a partir de precio", () => {
    expect(calculateMarginFromPrice(60, 100)).toBeCloseTo(40, 2);
  });

  it("calcula margen 0 cuando costo == precio", () => {
    expect(calculateMarginFromPrice(100, 100)).toBe(0);
  });

  it("calcula margen negativo cuando precio < costo", () => {
    expect(calculateMarginFromPrice(100, 80)).toBeLessThan(0);
  });

  it("lanza error si precio es 0", () => {
    expect(() => calculateMarginFromPrice(100, 0)).toThrow();
  });

  it("lanza error si precio es negativo", () => {
    expect(() => calculateMarginFromPrice(100, -10)).toThrow();
  });
});

describe("resolveBidirectionalPricing – modo margin", () => {
  it("deriva precio a partir de costo y margen", () => {
    const result = resolveBidirectionalPricing({ costUnit: 60, marginPct: 40 });
    expect(result.priceUnit).toBeCloseTo(100, 2);
    expect(result.marginPct).toBe(40);
    expect(result.costUnit).toBe(60);
  });

  it("margen 0 devuelve precio igual al costo", () => {
    const result = resolveBidirectionalPricing({ costUnit: 200, marginPct: 0 });
    expect(result.priceUnit).toBe(200);
  });
});

describe("resolveBidirectionalPricing – modo price", () => {
  it("deriva margen a partir de costo y precio", () => {
    const result = resolveBidirectionalPricing({ costUnit: 60, priceUnit: 100 });
    expect(result.marginPct).toBeCloseTo(40, 2);
    expect(result.priceUnit).toBe(100);
    expect(result.costUnit).toBe(60);
  });

  it("precio igual a costo resulta en margen 0", () => {
    const result = resolveBidirectionalPricing({ costUnit: 150, priceUnit: 150 });
    expect(result.marginPct).toBe(0);
  });
});

describe("resolveBidirectionalPricing – invariante bidireccional", () => {
  it("calculo ida-vuelta es consistente (margin -> price -> margin)", () => {
    const margin1 = 35;
    const cost = 78.5;
    const price = calculatePriceFromMargin(cost, margin1);
    const margin2 = calculateMarginFromPrice(cost, price);
    expect(margin2).toBeCloseTo(margin1, 1);
  });

  it("calculo ida-vuelta es consistente (price -> margin -> price)", () => {
    const price1 = 249.99;
    const cost = 140;
    const margin = calculateMarginFromPrice(cost, price1);
    const price2 = calculatePriceFromMargin(cost, margin);
    expect(price2).toBeCloseTo(price1, 1);
  });
});

describe("resolveBidirectionalPricing – errores", () => {
  it("lanza error si no se entrega ni precio ni margen", () => {
    expect(() => resolveBidirectionalPricing({ costUnit: 100 })).toThrow();
  });
});
