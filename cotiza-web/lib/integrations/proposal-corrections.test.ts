import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
vi.mock('server-only', () => ({}));
const m=vi.hoisted(() => ({ auth:vi.fn(), read:vi.fn(), create:vi.fn(), action:vi.fn() }));
vi.mock('./proposal-payments',() => ({ authorizeProposalFiscalDocument:m.auth,
  paymentFailure:() => NextResponse.json({error:'Uncertain'}, {status:502}) }));
vi.mock('./digestor-fiscal',() => ({ getFiscalCorrection:m.read, createFiscalCorrection:m.create, fiscalCorrectionAction:m.action }));
import { readCorrection, createCorrection, runCorrectionAction } from './proposal-corrections';
const uuid='11111111-2222-4333-8444-555555555555';
const input={idempotency_key:uuid,source_uuid:uuid,reason:'Corrección revisada',changes:{customer_name:'CORREGIDO'}};
const ctx=(paymentId?:string,operation='stamp') => ({params:Promise.resolve({proposalId:'p',paymentId,operation})});
const req=(data:unknown=input,url='https://cotiza.test/correction') => new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
describe('correction scope and explicit operations',() => {
  afterEach(()=>vi.unstubAllEnvs());
  beforeEach(() => {vi.resetAllMocks();m.auth.mockResolvedValue({draftId:'server-draft'});m.create.mockResolvedValue({pending:true});m.action.mockResolvedValue({pending:true});});
  it('uses the server draft with an exact source UUID and operation key',async () => {
    expect((await createCorrection(req(),ctx())).status).toBe(201);
    expect(m.create).toHaveBeenCalledWith('server-draft',input,undefined);
  });
  it.each([{...input,draft_id:'foreign'}, {...input,tenant_id:'foreign'}, {...input,changes:{amount:'10'}}, {...input,changes:{customer_rfc:'foreign'}}])('rejects economic/scope injection',async data => {
    expect((await createCorrection(req(data),ctx())).status).toBe(422);expect(m.create).not.toHaveBeenCalled();
  });
  it('does not permit invoice metadata corrections on a REP',async () => {
    expect((await createCorrection(req(),ctx('payment'))).status).toBe(422);expect(m.create).not.toHaveBeenCalled();
  });
  it('prepares a sandbox REP correction while production operations are enabled',async()=>{
    vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');
    m.auth.mockResolvedValue({draftId:'server-draft',environment:'sandbox'});
    const payload={...input,changes:{payment_form:'02'}};
    expect((await createCorrection(req(payload),ctx('payment'))).status).toBe(201);
    expect(m.create).toHaveBeenCalledWith('server-draft',payload,'payment');
  });
  it.each(['stamp','cancel-original','confirm-cancellation','reconcile'])('allows authenticated sandbox %s without production-only payload',async operation=>{
    vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');
    m.auth.mockResolvedValue({draftId:'server-draft',environment:'sandbox'});
    expect((await runCorrectionAction(req(operation==='reconcile'?{receipt_uuid:uuid}:{}),ctx('payment',operation))).status).toBe(200);
  });
  it.each([readCorrection,createCorrection,runCorrectionAction])('authorizes before any remote operation',async handler => {
    m.auth.mockResolvedValue({error:NextResponse.json({error:'Forbidden'},{status:403})});
    expect((await handler(req(),ctx())).status).toBe(403);
    for(const fn of [m.read,m.create,m.action])expect(fn).not.toHaveBeenCalled();
  });
  it.each(['stamp','cancel-original'])('requires production consent for %s',async operation=>{
    vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');
    expect((await runCorrectionAction(req({}),ctx(undefined,operation))).status).toBe(422);expect(m.action).not.toHaveBeenCalled();
    expect((await runCorrectionAction(req({confirm_real_operation:true,revision_id:uuid}),ctx(undefined,operation))).status).toBe(200);
  });
  it('requires production confirmation to prepare and strips UI-only consent',async()=>{
    vi.stubEnv('DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED','true');
    expect((await createCorrection(req(),ctx())).status).toBe(422);expect(m.create).not.toHaveBeenCalled();
    expect((await createCorrection(req({...input,confirm_real_operation:true}),ctx())).status).toBe(201);
    expect(m.create).toHaveBeenCalledWith('server-draft',input,undefined);
  });
  it('recovers by UUID through the distinct operation without stamping',async () => {
    expect((await runCorrectionAction(req({receipt_uuid:uuid}),ctx('payment','reconcile'))).status).toBe(200);
    expect(m.action).toHaveBeenCalledWith('server-draft','reconcile',{receipt_uuid:uuid},'payment');
  });
  it('rejects arbitrary operation names',async () => {
    expect((await runCorrectionAction(req(),ctx(undefined,'delete'))).status).toBe(422);expect(m.action).not.toHaveBeenCalled();
  });
  it('does not allow downloading a foreign or unissued revision',async () => {
    m.read.mockResolvedValue({history:[{id:'own',status:'prepared',result_xml_base64:null,result_uuid:null}]});
    expect((await readCorrection(req({},'https://cotiza.test/correction?format=xml&revision=foreign'),ctx())).status).toBe(404);
    expect((await readCorrection(req({},'https://cotiza.test/correction?format=xml&revision=own'),ctx())).status).toBe(409);
  });
  it('downloads a read-only diagnostic scoped to the authorized draft without XML or free text',async()=>{
    m.auth.mockResolvedValue({draftId:'server-draft',environment:'sandbox'});
    m.read.mockResolvedValue({environment:'production',kind:'receipt',active_uuid:uuid,pending:true,
      active_xml_base64:'DO-NOT-EXPORT',defaults:{customer_name:'PRIVATE NAME'},token:'PRIVATE TOKEN',
      history:[{id:uuid,source_uuid:uuid,result_uuid:null,status:'unknown',source_cancellation_status:'not_requested',
        request_xml_base64:Buffer.from('abc').toString('base64'),result_xml_base64:'DO-NOT-EXPORT',
        reason:'PRIVATE REASON',changes:{operation_reference:'PRIVATE REFERENCE'}}]});
    const response=await readCorrection(new Request('https://cotiza.test/correction?format=diagnostic&environment=production&draft_id=foreign'),ctx('payment'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('attachment;');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const data=await response.json();
    expect(data).toMatchObject({schema:'cotiza.fiscal-correction-diagnostic',version:1,environment:'sandbox',
      proposal_id:'p',draft_id:'server-draft',payment_id:'payment',pending:true,
      revisions:[{revision_id:uuid,pac_reference:{field:'IdComprobante',value:`revision-${uuid}`},status:'unknown',result_uuid:null,
        request_xml_sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}]});
    expect(Number.isNaN(Date.parse(data.generated_at))).toBe(false);
    expect(JSON.stringify(data)).not.toMatch(/PRIVATE|DO-NOT-EXPORT|xml_base64|foreign/);
    expect(m.auth).toHaveBeenCalledWith('p','correction_read');
    expect(m.read).toHaveBeenCalledExactlyOnceWith('server-draft','payment');
    expect(m.create).not.toHaveBeenCalled();expect(m.action).not.toHaveBeenCalled();
  });
  it('keeps diagnostic revision selection within the authorized history',async()=>{
    m.read.mockResolvedValue({history:[{id:'own',status:'prepared',request_xml_base64:null}]});
    const response=await readCorrection(new Request('https://cotiza.test/correction?format=diagnostic&revision=foreign'),ctx());
    expect(response.status).toBe(404);
    const own=await readCorrection(new Request('https://cotiza.test/correction?format=diagnostic&revision=own'),ctx());
    const data=await own.json();
    expect(data.revisions).toHaveLength(1);expect(data.revisions[0].request_xml_sha256).toBeNull();
    expect(data.payment_id).toBeNull();expect(m.action).not.toHaveBeenCalled();
  });
  it('rejects a diagnostic download before reading another tenant draft',async()=>{
    m.auth.mockResolvedValue({error:NextResponse.json({error:'Forbidden'},{status:403})});
    expect((await readCorrection(new Request('https://cotiza.test/correction?format=diagnostic'),ctx('foreign-payment'))).status).toBe(403);
    expect(m.read).not.toHaveBeenCalled();
  });
});
