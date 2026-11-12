import { expect, it, vi } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { extractText } from "unpdf";
vi.mock("server-only", () => ({}));
import { CfdiDocument, formatCfdiDate } from "./cfdi-document";
import { parseCfdiXml, parsePaymentReceiptXml } from "./cfdi-xml";
import { buildCfdiQrDataUrl } from "./cfdi-qr";
import { INVOICE_BASE64 } from "@/tests/fixtures/synthetic-invoice";
import { REP_BASE64, RECEIPT_UUID } from "@/tests/fixtures/synthetic-rep";
let qaIndex = 0;

async function read(cfdi = parseCfdiXml(INVOICE_BASE64), fiscalStatus?: string) {
  const before = JSON.stringify(cfdi);
  const buffer = await renderToBuffer(CfdiDocument({ cfdi, proposalNumber: "SYNTHETIC", qrDataUrl: await buildCfdiQrDataUrl(cfdi), fiscalStatus }));
  expect(JSON.stringify(cfdi)).toBe(before);
  if (process.env['CFDI_QA_DIR']) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(process.env['CFDI_QA_DIR'], { recursive: true });
    await writeFile(`${process.env['CFDI_QA_DIR']}/invoice-${++qaIndex}.pdf`, buffer);
  }
  const result = await extractText(new Uint8Array(buffer), { mergePages: true });
  return { ...result, text: String(result.text), compact: String(result.text).replace(/\s+/g, ""), buffer };
}

it("conserva UUID, certificados, sellos y cadena sin guiones de composición", async () => {
  const cfdi = parseCfdiXml(INVOICE_BASE64);
  cfdi.sello = "AB+/=0123456789".repeat(25); cfdi.timbre.selloSAT = "CD+/=9876543210".repeat(25);
  cfdi.cadenaOriginal = "||1.1|" + cfdi.timbre.uuid + "|" + cfdi.sello + "|00000000000000000000||";
  cfdi.folio = "12345678-abcd-4abc-8abc-123456789012";
  const result = await read(cfdi);
  expect(result.totalPages).toBe(1);
  for (const value of [cfdi.folio, cfdi.sello, cfdi.timbre.selloSAT, cfdi.cadenaOriginal, cfdi.timbre.uuid, cfdi.noCertificado, cfdi.timbre.noCertificadoSAT])
    expect(result.compact).toContain(value);
  expect(result.text).toContain("TOTAL MXN");
  expect(result.compact).toContain("$116.00");
  expect(result.text).toContain("Unidad: E48");
  expect(result.text).toContain("Página 1 de 1");
});

it("conserva conceptos completos y seguridad en documentos de varias hojas", async () => {
  const cfdi = parseCfdiXml(INVOICE_BASE64);
  cfdi.conceptos = Array.from({ length: 28 }, (_, index) => ({ ...cfdi.conceptos[0]!, descripcion: `CONCEPTO-${index}: ` + "Descripción detallada de servicios y licencias. ".repeat(9) + ` FIN-${index}` }));
  const result = await read(cfdi);
  expect(result.totalPages).toBeGreaterThan(2);
  for (let index = 0; index < 28; index++) expect(result.compact).toContain(`FIN-${index}`);
  expect(result.compact).toContain(cfdi.sello);
  expect(result.compact).toContain(cfdi.timbre.selloSAT);
  expect(result.compact).toContain(cfdi.cadenaOriginal);
  for (let page = 1; page <= result.totalPages; page++) expect(result.text).toContain(`Página ${page} de ${result.totalPages}`);
});

it("preserva la etiqueta cancelada y los datos económicos del REP", async () => {
  const cfdi = parsePaymentReceiptXml(REP_BASE64, RECEIPT_UUID);
  const result = await read(cfdi, "cancelled");
  expect(result.text).toContain("COMPROBANTE CANCELADO");
  expect(result.text).toContain("58.00 MXN");
  expect(result.text).toContain("Saldo anterior: 116.00");
  expect(result.text).toContain("Importe pagado: 58.00");
  expect(result.text).toContain("Saldo insoluto: 58.00");
  expect(result.text).toContain("Total del CFDI de pago: 0");
  expect(result.compact).toContain(cfdi.timbre.uuid);
});

it("conserva la hora fiscal sin offset y convierte sólo fechas con zona explícita", () => {
  expect(formatCfdiDate("2026-11-10T20:52:00")).toBe("10/11/2026 20:52:00");
  expect(formatCfdiDate("2026-11-11T02:52:00Z")).toContain("10/11/2026");
  expect(formatCfdiDate("2026-11-11T02:52:00Z")).toContain("20:52:00");
});
