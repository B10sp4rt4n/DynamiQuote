/** Real loopback HTTP against the synthetic Digestor server; never a PAC account. */
import { afterEach,expect,it,vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./proposal-payments',async () => {
  const {NextResponse}=await import('next/server');
  return {authorizeProposalFiscalDocument:async () => ({draftId:'credit-invoice'}),
    paymentFailure:(e:unknown)=>NextResponse.json({error:String(e)},{status:502})};
});
import { getFiscalCorrection,createFiscalCorrection,fiscalCorrectionAction,getBillingPayments,
  registerBillingPayment,stampPaymentReceipt,recoverPaymentReceipt,getPaymentReceipt } from './digestor-fiscal';
import {readCorrection} from './proposal-corrections';
import {parseCfdiXml} from '@/lib/pdf/cfdi-xml';
const fixtureUrl=process.env['FISCAL_CORRECTION_FIXTURE_URL'];
afterEach(()=>vi.unstubAllEnvs());
it.skipIf(!fixtureUrl)('invoice replacement and REP correction preserve sources and economic balances across services',async () => {
  const url=new URL(fixtureUrl!);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('Only loopback synthetic fixtures permitted');
  expect(await(await fetch(new URL('/__fixture',url))).json()).toMatchObject({synthetic:true,calls:{stamp:0}});
  vi.stubEnv('DIGESTOR_FISCAL_BASE_URL',url.toString());vi.stubEnv('DIGESTOR_FISCAL_USERNAME','synthetic');vi.stubEnv('DIGESTOR_FISCAL_PASSWORD','fixture-only');
  const original=await getFiscalCorrection('cancel-invoice');
  await createFiscalCorrection('cancel-invoice',{source_uuid:original.active_uuid,idempotency_key:crypto.randomUUID(),
    reason:'Corrección sintética de nombre fiscal',changes:{customer_name:'RECEPTOR SINTETICO CORREGIDO'}});
  const issued=await fiscalCorrectionAction('cancel-invoice','stamp',undefined);
  expect(issued.active_uuid).toBe(original.active_uuid);
  const replacement=issued.history[0].result_uuid;
  expect(replacement).toBeTruthy();
  await fiscalCorrectionAction('cancel-invoice','cancel-original',undefined);
  const active=await fiscalCorrectionAction('cancel-invoice','confirm-cancellation',undefined);
  expect(active.active_uuid).toBe(replacement);expect(active.pending).toBe(false);
  expect(active.defaults.customer_name).toBe('RECEPTOR SINTETICO CORREGIDO');
  const payment=await registerBillingPayment('credit-invoice',{amount:'58.00',reference:'SYNTHETIC-CORRECTION',
    idempotency_key:crypto.randomUUID(),payment_form:'03',paid_at:new Date(Date.now()-3_600_000).toISOString()});
  await expect(stampPaymentReceipt('credit-invoice',payment.id)).rejects.toThrow('incierto');
  const fixture=await(await fetch(new URL('/__fixture',url))).json();
  await recoverPaymentReceipt('credit-invoice',payment.id,fixture.last_uuid);
  const receiptOriginal=await getPaymentReceipt('credit-invoice',payment.id);
  const before=await getFiscalCorrection('credit-invoice',payment.id);
  await createFiscalCorrection('credit-invoice',{source_uuid:before.active_uuid,idempotency_key:crypto.randomUUID(),
    reason:'Corrección sintética de forma y referencia',changes:{payment_form:'02',operation_reference:'CORREGIDA'}},payment.id);
  await fiscalCorrectionAction('credit-invoice','stamp',undefined,payment.id);
  await fiscalCorrectionAction('credit-invoice','cancel-original',undefined,payment.id);
  const corrected=await fiscalCorrectionAction('credit-invoice','confirm-cancellation',undefined,payment.id);
  expect(corrected.active_uuid).not.toBe(before.active_uuid);
  expect(parseCfdiXml(corrected.active_xml_base64).relations).toEqual([{type:'04',uuids:[before.active_uuid]}]);
  const preserved=await getPaymentReceipt('credit-invoice',payment.id);
  expect(preserved.xml_base64).toBe(receiptOriginal.xml_base64);expect(preserved.fiscal_ready).toBe(true);
  expect(preserved.cancellation_status).toBe('cancelled');
  expect(await getBillingPayments('credit-invoice')).toMatchObject({paid:'58.00',balance:'58.00'});
  const pdf=await readCorrection(new Request('http://cotiza.test/correction?format=pdf'),{params:Promise.resolve({proposalId:'synthetic',paymentId:payment.id})});
  expect(pdf.status).toBe(200);const pdfBytes=Buffer.from(await pdf.arrayBuffer());expect(pdfBytes.subarray(0,5).toString()).toBe('%PDF-');
  if(process.env['FISCAL_CORRECTION_QA_PDF']) {const {writeFile}=await import('node:fs/promises');await writeFile(process.env['FISCAL_CORRECTION_QA_PDF'],pdfBytes);}
  const second=await registerBillingPayment('credit-invoice',{amount:'58.00',reference:'SYNTHETIC-FINAL',
    idempotency_key:crypto.randomUUID(),payment_form:'03',paid_at:new Date(Date.now()-1000).toISOString()});
  await stampPaymentReceipt('credit-invoice',second.id);
  expect(await getBillingPayments('credit-invoice')).toMatchObject({paid:'116.00',balance:'0.00'});
  expect((await(await fetch(new URL('/__fixture',url))).json()).calls).toEqual({stamp:4,retrieve:1,cancel:2,query:2});
},20000);
