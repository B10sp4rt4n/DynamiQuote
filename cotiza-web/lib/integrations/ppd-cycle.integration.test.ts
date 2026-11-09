// Cotiza routes + Prisma/PostgreSQL + real HTTP Digestor/SQL. Only session/PAC synthetic.
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { parsePaymentReceiptXml } from '@/lib/pdf/cfdi-xml';
vi.mock('server-only', () => ({}));
const session = vi.hoisted(() => ({ tenantId: 'synthetic-a' }));
vi.mock('@/lib/auth/tenant-context', () => ({ getCurrentTenantContext: async () => ({ id:session.tenantId, userId:'synthetic-seller', userRole:'user', authMode:'clerk' }) }));
const enabled = Boolean(process.env.COTIZA_TEST_DATABASE_URL && process.env.FISCAL_PPD_FIXTURE_URL);
let db: typeof import('@/lib/db/prisma').prisma;
let payments: typeof import('@/app/api/proposals/[proposalId]/invoice/payments/route');
let receipt: typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/route');
let prepare: typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/prepare/route').POST;
let stamp: typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/stamp/route').POST;
let recover: typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/reconcile/route').POST;
let pdf: typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/pdf/route').GET;
const originalFetch = global.fetch;
const fixture = async () => (await originalFetch(process.env.FISCAL_PPD_FIXTURE_URL+'/__fixture')).json();
const context = (paymentId='none') => ({ params:Promise.resolve({proposalId:'ppd-connected-proposal',paymentId}) });
const request = (body?:unknown, download=false) => new Request('http://localhost/payments'+(download?'?download=1':''),
  body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
const getSummary = async () => { const r=await payments.GET(request(),context()); expect(r.status).toBe(200); return r.json(); };
beforeAll(async () => {
  if (!enabled) return;
  for (const value of [process.env.COTIZA_TEST_DATABASE_URL!,process.env.FISCAL_PPD_FIXTURE_URL!])
    if (!['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname)) throw Error('Disposable loopback resources required');
  const data=await fixture(); expect(data.mode).toBe('synthetic-ppd-cycle-no-pac');
  process.env.DATABASE_URL=process.env.COTIZA_TEST_DATABASE_URL;
  process.env.DIGESTOR_FISCAL_BASE_URL=process.env.FISCAL_PPD_FIXTURE_URL;
  process.env.DIGESTOR_FISCAL_USERNAME='synthetic';process.env.DIGESTOR_FISCAL_PASSWORD='fixture-only';
  process.env.DIGESTOR_FISCAL_TENANT_ID='synthetic-a';process.env.DIGESTOR_FISCAL_PPD_ENABLED='true';
  process.env.DIGESTOR_FISCAL_PPD_PRODUCTION_ENABLED='false';
  ({prisma:db}=await import('@/lib/db/prisma'));
  payments=await import('@/app/api/proposals/[proposalId]/invoice/payments/route');
  receipt=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/route');
  ({POST:prepare}=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/prepare/route'));
  ({POST:stamp}=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/stamp/route'));
  ({POST:recover}=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/reconcile/route'));
  ({GET:pdf}=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/pdf/route'));
  await db.tenant.create({data:{tenant_id:'synthetic-a',slug:'synthetic-a',name:'SYNTHETIC',created_at:new Date()}});
  await db.proposals.create({data:{proposal_id:'ppd-connected-proposal',tenant_id:'synthetic-a',created_by:'synthetic-seller',created_by_user_id:'synthetic-seller',
    status:'draft',created_at:new Date(),invoice_draft_id:data.invoice.draftId,invoice_uuid:data.invoice.uuid,invoice_xml_base64:data.invoice.xmlBase64,invoice_status:'stamped'}});
},30_000);
afterAll(async()=>{global.fetch=originalFetch;if(db)await db.$disconnect();});

it.skipIf(!enabled)('dos pagos, duplicados, REP incierto, recuperación, XML/PDF y saldo con HTTP/SQL reales aislados',async()=>{
  expect(await getSummary()).toMatchObject({paid:'0.00',balance:'116.00',economic_settled:false,fiscal_complete:false});
  const first={amount:'58.00',reference:'SYNTHETIC-TRANSFER-1',payment_form:'03',paid_at:new Date(Date.now()-60_000).toISOString(),idempotency_key:'11111111-2222-4333-8444-555555555555'};
  // Lose only the actual backend's successful registration response, then retry the same key.
  let lost=false;
  global.fetch=async(input,init)=>{
    const r=await originalFetch(input,init);
    if(!lost && init?.method==='POST' && String(input).endsWith('/payments') && r.ok){lost=true;throw Error('Synthetic registration response lost after commit');}
    return r;
  };
  expect((await payments.POST(request(first),context())).status).toBe(502);
  expect((await getSummary()).payments).toHaveLength(1);
  const retry=await payments.POST(request(first),context());expect(retry.status).toBe(201);
  const one=await retry.json();expect((await getSummary()).payments).toHaveLength(1);
  expect((await payments.POST(request({...first,idempotency_key:crypto.randomUUID()}),context())).status).toBe(502);
  expect((await payments.POST(request({...first,amount:'1.00'}),context())).status).toBe(502);
  expect((await receipt.GET(request(undefined,true),context(one.id))).status).toBe(409);
  expect((await prepare(request({}),context(one.id))).status).toBe(200);
  expect((await fixture()).calls.stamp).toBe(0);
  const competing=await Promise.all([stamp(request({}),context(one.id)),stamp(request({}),context(one.id))]);
  expect(competing.map(r=>r.status).sort()).toEqual([200,502]);
  expect((await getSummary()).balance).toBe('58.00');
  const second={...first,reference:'SYNTHETIC-TRANSFER-2',idempotency_key:crypto.randomUUID(),paid_at:new Date(Date.now()-30_000).toISOString()};
  const registered=await payments.POST(request(second),context());expect(registered.status).toBe(201);const two=await registered.json();
  expect(await getSummary()).toMatchObject({paid:'116.00',balance:'0.00',economic_settled:true,fiscal_complete:false,receipts_pending_count:1});
  expect((await stamp(request({}),context(two.id))).status).toBe(502);
  expect((await stamp(request({}),context(two.id))).status).toBe(502);
  const oneState=await (await receipt.GET(request(),context(one.id))).json();
  expect((await recover(request({receipt_uuid:oneState.receipt_uuid}),context(two.id))).status).toBe(502);
  const actual=await fixture();expect(actual.calls.stamp).toBe(2);
  expect((await recover(request({receipt_uuid:actual.last_uuid}),context(two.id))).status).toBe(200);
  expect((await recover(request({receipt_uuid:actual.last_uuid}),context(two.id))).status).toBe(200);
  const summary=await getSummary();expect(summary).toMatchObject({paid:'116.00',balance:'0.00',receipts_pending_count:0,fiscal_complete:true});
  expect(summary.payments).toHaveLength(2);
  const xml=await receipt.GET(request(undefined,true),context(two.id));expect(xml.status).toBe(200);
  const bytes=await xml.text();const parsed=parsePaymentReceiptXml(Buffer.from(bytes).toString('base64'),actual.last_uuid);
  expect(parsed.payments?.[0].documents[0]).toMatchObject({partiality:'2',before:'58.00',paid:'58.00',after:'0.00'});
  const printed=await pdf(request(),context(two.id));expect(printed.status).toBe(200);
  expect(Buffer.from(await printed.arrayBuffer()).subarray(0,5).toString()).toBe('%PDF-');
  expect((await payments.POST(request({...second,amount:'0.01',reference:'OVERPAY',idempotency_key:crypto.randomUUID()}),context())).status).toBe(502);
  session.tenantId='foreign-tenant';expect((await payments.GET(request(),context())).status).toBe(403);session.tenantId='synthetic-a';
  expect((await fixture()).calls).toEqual({stamp:2,cancel:0,query:0,retrieve:2});
},30_000);
