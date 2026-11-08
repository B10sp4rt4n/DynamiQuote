/** Cross-service HTTP acceptance against the in-memory Digestor fixture only. */
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('./proposal-payments', async () => {
  const { NextResponse } = await import('next/server');
  return { authorizeProposalPayments: async () => ({ draftId: 'credit-invoice' }),
    paymentFailure: (error: unknown) => NextResponse.json({ error: String(error) }, { status: 502 }) };
});
import { getBillingPayments, registerBillingPayment, preparePaymentReceipt, stampPaymentReceipt,
  recoverPaymentReceipt, cancelBillingDocument, reconcileBillingCancellation } from './digestor-fiscal';
import { GET as receiptPdf } from '@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/pdf/route';
const fixtureUrl = process.env['FISCAL_CYCLE_FIXTURE_URL'];
afterEach(() => vi.unstubAllEnvs());
it.skipIf(!fixtureUrl)('PPD two payments, uncertain REP recovery, PDF and cancellation across real HTTP', async () => {
  const url = new URL(fixtureUrl!);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') throw new Error('Only isolated loopback fixture permitted');
  expect(await (await fetch(new URL('/__fixture', url))).json()).toMatchObject({ synthetic: true, calls: { stamp: 0 } });
  vi.stubEnv('DIGESTOR_FISCAL_BASE_URL', url.toString());
  vi.stubEnv('DIGESTOR_FISCAL_USERNAME', 'synthetic'); vi.stubEnv('DIGESTOR_FISCAL_PASSWORD', 'fixture-only');
  expect(await getBillingPayments('credit-invoice')).toMatchObject({ total: '116.00', balance: '116.00' });
  const input = { amount: '58.00', reference: 'SYNTHETIC-ONE', idempotency_key: crypto.randomUUID(),
    paid_at: new Date(Date.now()-3_600_000).toISOString(), payment_form: '03' };
  const first = await registerBillingPayment('credit-invoice', input);
  expect((await registerBillingPayment('credit-invoice', input)).id).toBe(first.id);
  expect((await preparePaymentReceipt('credit-invoice', first.id)).preliminary).toBe(true);
  expect((await stampPaymentReceipt('credit-invoice', first.id)).receipt_status).toBe('stamped');
  const second = await registerBillingPayment('credit-invoice', { ...input, reference: 'SYNTHETIC-TWO', idempotency_key: crypto.randomUUID() });
  await expect(stampPaymentReceipt('credit-invoice', second.id)).rejects.toThrow('incierto');
  await expect(stampPaymentReceipt('credit-invoice', second.id)).rejects.toThrow('no repetir');
  const fixture = await (await fetch(new URL('/__fixture', url))).json();
  expect(fixture.calls.stamp).toBe(2);
  expect((await recoverPaymentReceipt('credit-invoice', second.id, fixture.last_uuid)).receipt_status).toBe('stamped');
  expect(await getBillingPayments('credit-invoice')).toMatchObject({ paid: '116.00', balance: '0.00' });
  const pdf = await receiptPdf(new Request(url+'/pdf'), { params: Promise.resolve({ proposalId: 'synthetic', paymentId: second.id }) });
  expect(pdf.status).toBe(200); expect(pdf.headers.get('content-type')).toBe('application/pdf');
  expect(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString()).toBe('%PDF-');
  const intent = { reason: '03' as const, idempotency_key: crypto.randomUUID() };
  await expect(cancelBillingDocument('credit-invoice', intent)).rejects.toThrow('pagos registrados');
  expect((await cancelBillingDocument('credit-invoice', intent, second.id)).status).toBe('requested');
  expect((await reconcileBillingCancellation('credit-invoice', second.id)).status).toBe('cancelled');
  expect(await getBillingPayments('credit-invoice')).toMatchObject({ paid: '116.00', balance: '0.00' });
  const emptyIntent = { ...intent, idempotency_key: crypto.randomUUID() };
  expect((await cancelBillingDocument('cancel-invoice', emptyIntent)).status).toBe('requested');
  expect((await cancelBillingDocument('cancel-invoice', emptyIntent)).status).toBe('requested');
  expect((await reconcileBillingCancellation('cancel-invoice')).status).toBe('cancelled');
  expect((await (await fetch(new URL('/__fixture', url))).json()).calls).toEqual({ stamp: 2, retrieve: 1, cancel: 2, query: 2 });
}, 20_000);
