import { expect, it } from "vitest";
import { readInvoiceStamp } from "./invoice-stamp";
import { INVOICE_UUID, INVOICE_XML, INVOICE_BASE64 } from "@/tests/fixtures/synthetic-invoice";
const encode = (xml: string) => Buffer.from(xml).toString("base64");
it("lee el timbre por namespace y conserva exactamente los bytes recibidos", () => {
  expect(readInvoiceStamp(INVOICE_BASE64, INVOICE_UUID.toUpperCase())).toEqual({ uuid: INVOICE_UUID, bytes: Buffer.from(INVOICE_XML) });
  const renamed = INVOICE_XML.replaceAll("cfdi:", "doc:").replace('xmlns:cfdi=', 'xmlns:doc=').replaceAll("tfd:", "stamp:").replace('xmlns:tfd=', 'xmlns:stamp=');
  expect(readInvoiceStamp(encode(renamed)).uuid).toBe(INVOICE_UUID);
});
it.each([
  INVOICE_XML.replace("http://www.sat.gob.mx/TimbreFiscalDigital", "https://invalid.test/stamp"),
  INVOICE_XML.replace('TipoDeComprobante="I"', 'TipoDeComprobante="P"'),
  INVOICE_XML.replace('Version="4.0"', 'Version="3.3"'),
  INVOICE_XML.replace(/<tfd:TimbreFiscalDigital[^>]+\/>/, ""),
  INVOICE_XML.replace('UUID="'+INVOICE_UUID+'"', 'UUID="inventado"'),
  INVOICE_XML.replace("</cfdi:Complemento>", `<tfd:TimbreFiscalDigital UUID="${INVOICE_UUID}"/></cfdi:Complemento>`),
  '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+INVOICE_XML,
  INVOICE_XML.replace(/<cfdi:Receptor[^>]+\/>/, ""),
  '<other UUID="'+INVOICE_UUID+'"/>',
])("rechaza estructuras ambiguas o ajenas", xml => expect(() => readInvoiceStamp(encode(xml))).toThrow());
it("rechaza base64 corrupto y UUID diferente", () => {
  for (const encoded of ["!", INVOICE_BASE64+"!", "", "eG1s", "////"])
    expect(() => readInvoiceStamp(encoded)).toThrow();
  expect(() => readInvoiceStamp(INVOICE_BASE64, "22222222-2222-4333-8444-555555555555")).toThrow();
});
