import { describe, expect, it } from "vitest";

import { buildDefaultTermsLines, buildTermsList } from "@/lib/pdf/proposal-terms";

describe("buildDefaultTermsLines", () => {
  it("replica la vigencia del encabezado en vez de decir 15 dias", () => {
    const lines = buildDefaultTermsLines({ currency: "MXN", validUntilLabel: "30 de septiembre de 2026" });

    expect(lines[0]).toBe("Vigencia de la propuesta: hasta el 30 de septiembre de 2026.");
    expect(lines.join(" ")).not.toContain("15 dias");
  });

  it("solo usa 15 dias naturales cuando la propuesta no tiene vigencia capturada", () => {
    const lines = buildDefaultTermsLines({ currency: "MXN", validUntilLabel: null });

    expect(lines[0]).toContain("15 dias naturales");
  });

  it("nombra la moneda real de la propuesta, no 'moneda nacional'", () => {
    const usd = buildDefaultTermsLines({ currency: "usd", validUntilLabel: null }).join(" ");
    const mxn = buildDefaultTermsLines({ currency: "MXN", validUntilLabel: null }).join(" ");

    expect(usd).toContain("dolares estadounidenses (USD)");
    expect(mxn).toContain("pesos mexicanos (MXN)");
    expect(usd).not.toContain("moneda nacional");
  });

  it("no inventa moneda si la propuesta no la tiene", () => {
    const text = buildDefaultTermsLines({ currency: null, validUntilLabel: null }).join(" ");

    expect(text).not.toContain("Precios expresados en");
    expect(text).toContain("IVA (16%)");
  });

  it("acepta una moneda no catalogada tal cual", () => {
    expect(buildDefaultTermsLines({ currency: "CAD", validUntilLabel: null }).join(" ")).toContain("Precios expresados en CAD.");
  });
});

describe("buildTermsList", () => {
  const context = { currency: "MXN", validUntilLabel: "30 de septiembre de 2026" };

  it("respeta los terminos propios de la propuesta sin tocarlos", () => {
    expect(buildTermsList("1. Pago a 30 dias\n\n  2. Entrega en 5 dias  ", context)).toEqual([
      "1. Pago a 30 dias",
      "2. Entrega en 5 dias",
    ]);
  });

  it("cae a los terminos por defecto solo cuando estan vacios", () => {
    expect(buildTermsList("   \n ", context)).toEqual(buildDefaultTermsLines(context));
  });
});
