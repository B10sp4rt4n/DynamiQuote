export type BidirectionalPricingInput = {
  costUnit: number;
  marginPct?: number;
  priceUnit?: number;
};

export type BidirectionalPricingOutput = {
  costUnit: number;
  marginPct: number;
  priceUnit: number;
};

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMargin(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePriceFromMargin(costUnit: number, marginPct: number): number {
  if (marginPct >= 100) {
    throw new Error("El margen no puede ser mayor o igual a 100");
  }

  const denominator = 1 - marginPct / 100;

  if (denominator <= 0) {
    throw new Error("Margen invalido para calcular precio");
  }

  return roundCurrency(costUnit / denominator);
}

export function calculateMarginFromPrice(costUnit: number, priceUnit: number): number {
  if (priceUnit <= 0) {
    throw new Error("El precio debe ser mayor a 0");
  }

  return roundMargin(((priceUnit - costUnit) / priceUnit) * 100);
}

export function resolveBidirectionalPricing(input: BidirectionalPricingInput): BidirectionalPricingOutput {
  const { costUnit, marginPct, priceUnit } = input;

  if (marginPct === undefined && priceUnit === undefined) {
    throw new Error("Debes enviar marginPct o priceUnit");
  }

  if (priceUnit !== undefined) {
    const resolvedMargin = calculateMarginFromPrice(costUnit, priceUnit);

    return {
      costUnit: roundCurrency(costUnit),
      marginPct: resolvedMargin,
      priceUnit: roundCurrency(priceUnit),
    };
  }

  const resolvedPrice = calculatePriceFromMargin(costUnit, marginPct ?? 0);

  return {
    costUnit: roundCurrency(costUnit),
    marginPct: roundMargin(marginPct ?? 0),
    priceUnit: resolvedPrice,
  };
}
