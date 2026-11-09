import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), cancel: vi.fn(), reconcile: vi.fn() }));
vi.mock('./proposal-payments', () => ({ authorizeProposalFiscalDocument: m.auth,
  paymentFailure: () => NextResponse.json({ error: 'Uncertain result' }, { status: 502 }) }));
vi.mock('./digestor-fiscal', () => ({ getBillingCancellation: m.read, cancelBillingDocument: m.cancel, reconcileBillingCancellation: m.reconcile }));
import { readCancellation, requestCancellation, reconcileCancellation } from './proposal-cancellations';
const ctx = { params: Promise.resolve({ proposalId: 'proposal', paymentId: 'payment' }) };
const input = { reason: '03', idempotency_key: '11111111-2222-4333-8444-555555555555' };
const req = (extra = {}) => new Request('https://cotiza.test/cancellation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, ...extra }),
});
describe('cancellation proxy', () => {
  afterEach(()=>vi.unstubAllEnvs());
  beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ draftId: 'server-resolved' }); m.cancel.mockResolvedValue({ status: 'requested' }); });
  it('uses the server-resolved draft, receipt scope and stable key', async () => {
    expect((await requestCancellation(req(), ctx)).status).toBe(200);
    expect(m.cancel).toHaveBeenCalledWith('server-resolved', input, 'payment');
  });
  it.each([{ reason: '01' }, { reason: '04' }, { tenant_id: 'foreign' }, { draftId: 'foreign' }, { replacement_draft_id: 'foreign' }, { idempotency_key: 'bad' }])('rejects unsupported or injected %j', async extra => {
    expect((await requestCancellation(req(extra), ctx)).status).toBe(422); expect(m.cancel).not.toHaveBeenCalled();
  });
  it.each([readCancellation, requestCancellation, reconcileCancellation])('authorizes before contacting the service', async handler => {
    m.auth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await handler(req(), ctx)).status).toBe(403);
    for (const mock of [m.read, m.cancel, m.reconcile]) expect(mock).not.toHaveBeenCalled();
  });
  it('status consultation never resubmits cancellation', async () => {
    m.reconcile.mockResolvedValue({ status: 'cancelled' });
    expect((await reconcileCancellation(req(), ctx)).status).toBe(200);
    expect(m.reconcile).toHaveBeenCalledWith('server-resolved', 'payment'); expect(m.cancel).not.toHaveBeenCalled();
  });
  it('serves the stored acknowledgement with no caching', async () => {
    m.read.mockResolvedValue({ status: 'requested', acknowledgement_xml: '<synthetic-ack/>' });
    const response = await readCancellation(new Request('https://cotiza.test/cancellation?download=1'), ctx);
    expect(await response.text()).toBe('<synthetic-ack/>'); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('requires and strips production consent before forwarding',async()=>{
    vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');
    expect((await requestCancellation(req(),ctx)).status).toBe(422);expect(m.cancel).not.toHaveBeenCalled();
    expect((await requestCancellation(req({confirm_real_operation:true,expected_uuid:input.idempotency_key}),ctx)).status).toBe(200);
    expect(m.cancel).toHaveBeenCalledWith('server-resolved',{...input,expected_uuid:input.idempotency_key},'payment');
  });
  it('uses the authenticated sandbox scope while production operations are enabled',async()=>{
    vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');
    m.auth.mockResolvedValue({draftId:'server-resolved',environment:'sandbox'});
    expect((await requestCancellation(req(),ctx)).status).toBe(200);
    expect(m.cancel).toHaveBeenCalledWith('server-resolved',input,'payment');
  });
  it('does not retry a failed cancellation request', async () => {
    m.cancel.mockRejectedValue(new Error('synthetic timeout'));
    expect((await requestCancellation(req(), ctx)).status).toBe(502); expect(m.cancel).toHaveBeenCalledTimes(1);
  });
});
