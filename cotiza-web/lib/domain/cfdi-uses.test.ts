import { describe, expect, it } from "vitest";
import { CFDI_USES, clientCfdiUseIssue, isCfdiUseCompatible } from "./cfdi-uses";

describe("client CFDI use catalog", () => {
  it("contains the 24 CFDI 4.0 codes without the retired P01", () => {
    expect(CFDI_USES.map((entry) => entry.code)).toEqual([
      "G01", "G02", "G03", "I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08",
      "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "S01", "CP01", "CN01",
    ]);
  });
  it("offers commercial uses for a moral 601 without personal deductions or special documents", () => {
    expect(CFDI_USES.filter((entry) => !clientCfdiUseIssue(entry.code, "AAA010101AAA", "601")).map((entry) => entry.code))
      .toEqual(["G01", "G02", "G03", "I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08", "S01"]);
  });
  it.each(["607", "615"])("allows personal deductions for physical regime %s", (regime) => {
    expect(isCfdiUseCompatible("D01", "AAAA010101AAA", regime)).toBe(true);
  });
  it("rejects RESICO personal deductions and the incorrect 616 general expense pairing", () => {
    expect(isCfdiUseCompatible("D01", "AAAA010101AAA", "626")).toBe(false);
    expect(isCfdiUseCompatible("G03", "AAAA010101AAA", "616")).toBe(false);
    expect(isCfdiUseCompatible("G02", "AAAA010101AAA", "616")).toBe(true);
    expect(isCfdiUseCompatible("G03", "AAAA010101AAA", "605")).toBe(false);
    expect(isCfdiUseCompatible("D01", "AAA010101AAA", "605")).toBe(false);
  });
  it("supports pending client data and warns instead of coercing old or special values", () => {
    expect(clientCfdiUseIssue("", "", "")).toBeNull();
    expect(clientCfdiUseIssue("P01", "", "")).toContain("no está en el catálogo");
    expect(clientCfdiUseIssue("CP01", "AAA010101AAA", "601")).toContain("complementos de pago");
    expect(clientCfdiUseIssue("CN01", "AAAA010101AAA", "605")).toContain("recibos de nómina");
    expect(isCfdiUseCompatible("S01", "XEXX010101000", "616")).toBe(true);
    expect(isCfdiUseCompatible("G02", "XEXX010101000", "616")).toBe(false);
  });
});
