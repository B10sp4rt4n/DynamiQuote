import { afterEach, expect, it, vi } from "vitest";
import QRCode from "qrcode";

vi.mock("server-only", () => ({}));

import { buildCfdiQrDataUrl } from "./cfdi-qr";
import { parseCfdiXml, parsePaymentReceiptXml } from "./cfdi-xml";
import { INVOICE_BASE64 } from "@/tests/fixtures/synthetic-invoice";
import { REP_BASE64, RECEIPT_UUID } from "@/tests/fixtures/synthetic-rep";

afterEach(() => vi.restoreAllMocks());

it("genera el QR con la secuencia SAT para precargar UUID y ambos RFC", async () => {
  const cfdi = parseCfdiXml(INVOICE_BASE64);
  const before = JSON.stringify(cfdi);
  const render = vi.spyOn(QRCode, "toDataURL");

  expect(await buildCfdiQrDataUrl(cfdi)).toMatch(/^data:image\/png;base64,/);

  const encoded = String(render.mock.calls[0]?.[0]);
  expect(encoded).toBe(
    `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?&id=${cfdi.timbre.uuid}` +
    `&re=${cfdi.emisor.rfc}&rr=${cfdi.receptor.rfc}&tt=116.000000&fe=${encodeURIComponent(cfdi.sello.slice(-8))}`,
  );
  expect([...new URL(encoded).searchParams.keys()]).toEqual(["id", "re", "rr", "tt", "fe"]);
  expect(JSON.stringify(cfdi)).toBe(before);
});

it("conserva caracteres reservados de RFC y sello como valores de consulta", async () => {
  const cfdi = parseCfdiXml(INVOICE_BASE64);
  cfdi.emisor.rfc = "A&B010101AAA";
  cfdi.sello = "SELLO-+A/Bcd==";
  cfdi.timbre.selloSAT = "OTRO-XXXXXXXX";
  const render = vi.spyOn(QRCode, "toDataURL");

  await buildCfdiQrDataUrl(cfdi);

  const params = new URL(String(render.mock.calls[0]?.[0])).searchParams;
  expect([...params.keys()]).toEqual(["id", "re", "rr", "tt", "fe"]);
  expect(params.get("re")).toBe("A&B010101AAA");
  expect(params.get("fe")).toBe("+A/Bcd==");
  expect(params.size).toBe(5);
});

it("usa el UUID y total cero del REP en su propio enlace SAT", async () => {
  const cfdi = parsePaymentReceiptXml(REP_BASE64, RECEIPT_UUID);
  const render = vi.spyOn(QRCode, "toDataURL");

  await buildCfdiQrDataUrl(cfdi);

  const url = new URL(String(render.mock.calls[0]?.[0]));
  expect(url.search).toMatch(/^\?&id=/);
  expect(url.searchParams.get("id")).toBe(RECEIPT_UUID);
  expect(url.searchParams.get("re")).toBe(cfdi.emisor.rfc);
  expect(url.searchParams.get("rr")).toBe(cfdi.receptor.rfc);
  expect(url.searchParams.get("tt")).toBe("0.000000");
  expect(url.searchParams.get("fe")).toBe(cfdi.sello.slice(-8));
});
