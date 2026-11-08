import { describe, expect, it, vi } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
vi.mock('server-only', () => ({}));
import { parseCfdiXml, parsePaymentReceiptXml } from './cfdi-xml';
import { CfdiDocument } from './cfdi-document';
import { buildCfdiQrDataUrl } from './cfdi-qr';
import { REP_XML, REP_BASE64, RECEIPT_UUID, INVOICE_UUID } from '@/tests/fixtures/synthetic-rep';

describe('REP printed representation from the stamped XML', () => {
  it('preserves payment amounts, partiality and invoice UUID separately from zero CFDI total', () => {
    const value = parsePaymentReceiptXml(REP_BASE64, RECEIPT_UUID);
    expect(value.total).toBe(0);
    expect(value.payments).toEqual([{ date: '2026-11-06T10:30:00', form: '03', currency: 'MXN', amount: '58.00',
      documents: [{ uuid: INVOICE_UUID, currency: 'MXN', partiality: '1', before: '116.00', paid: '58.00', after: '58.00' }] }]);
  });
  it.each([
    REP_XML.replace('TipoDeComprobante="P"', 'TipoDeComprobante="I"'),
    REP_XML.replace('ImpPagado="58.00"', ''),
    REP_XML.replace('Version="2.0"', 'Version="1.0"'),
    '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+REP_XML,
    '<bad',
  ])('refuses malformed or incomplete receipt XML', xml => {
    expect(() => parsePaymentReceiptXml(Buffer.from(xml).toString('base64'), RECEIPT_UUID)).toThrow();
  });
  it('refuses a different UUID from the recorded receipt', () => {
    expect(() => parsePaymentReceiptXml(REP_BASE64, INVOICE_UUID)).toThrow();
  });
  it('keeps invoice parsing compatible when no payment complement exists', () => {
    const xml = REP_XML.replace(/<pago20:Pagos[\s\S]*?<\/pago20:Pagos>/, '').replace('TipoDeComprobante="P"', 'TipoDeComprobante="I"');
    expect(parseCfdiXml(Buffer.from(xml).toString('base64')).payments).toBeUndefined();
  });
  it('renders the actual receipt document and an explicit cancelled representation', async () => {
    const cfdi = parsePaymentReceiptXml(REP_BASE64, RECEIPT_UUID);
    const qrDataUrl = await buildCfdiQrDataUrl(cfdi);
    const buffer = await renderToBuffer(CfdiDocument({ cfdi, proposalNumber: 'SINTETICO', qrDataUrl, fiscalStatus: 'cancelled' }));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env['REP_QA_PDF']) {
      const { writeFile } = await import('node:fs/promises'); await writeFile(process.env['REP_QA_PDF'], buffer);
    }
  });
});
