/** Route → real SQL → HTTP/JWT → real SQL. External PAC and human identity are synthetic. */
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
vi.mock('server-only',()=>({}));
const identity=vi.hoisted(()=>({tenant:'rep-acceptance',user:'synthetic-seller'}));
vi.mock('@/lib/auth/tenant-context',()=>({getCurrentTenantContext:async()=>({id:identity.tenant,userId:identity.user,userRole:'user',authMode:'clerk'})}));
const base=process.env.REP_RECOVERY_FIXTURE_URL;
const enabled=Boolean(base&&process.env.COTIZA_TEST_DATABASE_URL);
const realFetch=globalThis.fetch;
let losePayment=false,loseReceipt=false,loseRead=false;
let db:typeof import('@/lib/db/prisma').prisma;
let routes:{register:typeof import('@/app/api/proposals/[proposalId]/invoice/payments/route').POST;
 summary:typeof import('@/app/api/proposals/[proposalId]/invoice/payments/route').GET;
 stamp:typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/stamp/route').POST;
 recover:typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/reconcile/route').POST;
 read:typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/route').GET;
 pdf:typeof import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/pdf/route').GET};
type Snapshot={mode:string;calls:{stamp:number;retrieve:number};issued:Record<string,string>;invoice:{uuid:string;xmlBase64:string};
 invoice_unchanged:boolean;payments:Array<{id:string;sequence:number;amount:string;balance_after:string;declaration_hash:string}>;
 recovered_acts:number;receipts:Array<{payment_id:string;status:string;uuid:string;xml_base64:string}>};
const snapshot=async():Promise<Snapshot>=>(await realFetch(base+'/__fixture')).json();
const ctx=(paymentId?:string)=>({params:Promise.resolve({proposalId:'rep-acceptance-proposal',paymentId:paymentId??''})});
const req=(body?:unknown)=>new Request('http://cotiza.test/rep',{method:body===undefined?'GET':'POST',headers:{origin:'http://cotiza.test','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
beforeAll(async()=>{
 if(!enabled)return;
 if(new URL(base!).hostname!=='127.0.0.1'||!['127.0.0.1','localhost','[::1]'].includes(new URL(process.env.COTIZA_TEST_DATABASE_URL!).hostname))throw Error('Disposable loopback fixture required');
 const initial=await snapshot();expect(initial.mode).toBe('synthetic-postgres-rep-no-pac');expect(initial.calls.stamp).toBe(0);
 process.env.DATABASE_URL=process.env.COTIZA_TEST_DATABASE_URL;
 for(const [key,value] of Object.entries({DIGESTOR_FISCAL_BASE_URL:base!,DIGESTOR_FISCAL_USERNAME:'synthetic',DIGESTOR_FISCAL_PASSWORD:'fixture-only',DIGESTOR_FISCAL_TENANT_ID:identity.tenant,DIGESTOR_FISCAL_PPD_ENABLED:'true',DIGESTOR_FISCAL_PPD_PRODUCTION_ENABLED:'false',DIGESTOR_FISCAL_SANDBOX_TENANT_ID:''}))vi.stubEnv(key,value);
 ({prisma:db}=await import('@/lib/db/prisma'));
 await db.tenant.create({data:{tenant_id:identity.tenant,slug:identity.tenant,name:'Synthetic REP acceptance',created_at:new Date()}});
 await db.proposals.create({data:{proposal_id:'rep-acceptance-proposal',tenant_id:identity.tenant,status:'approved',created_by:identity.user,created_by_user_id:identity.user,created_at:new Date(),
  invoice_status:'stamped',invoice_draft_id:'credit-invoice',invoice_uuid:initial.invoice.uuid,invoice_xml_base64:initial.invoice.xmlBase64}});
 const payments=await import('@/app/api/proposals/[proposalId]/invoice/payments/route');
 const stamp=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/stamp/route');
 const recovery=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/reconcile/route');
 const read=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/route');
 const pdf=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/pdf/route');
 routes={register:payments.POST,summary:payments.GET,stamp:stamp.POST,recover:recovery.POST,read:read.GET,pdf:pdf.GET};
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
  if(!url.startsWith(base!+'/'))throw Error('Unexpected outbound request in REP acceptance');
  const response=await realFetch(input,init);
  const pathname=new URL(url).pathname;
  const drop=response.ok&&((losePayment&&init?.method==='POST'&&pathname.endsWith('/payments'))||(loseReceipt&&pathname.endsWith('/receipt/stamp'))||(loseRead&&init?.method==='GET'&&pathname.endsWith('/receipt')));
  if(drop){if(pathname.endsWith('/payments'))losePayment=false;else if(pathname.endsWith('/stamp'))loseReceipt=false;else loseRead=false;
   await response.arrayBuffer();throw new TypeError('Deliberate loss after Digestor persisted its result');}
  return response;
 });
},30000);
afterAll(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();if(db)await db.$disconnect();});
it.skipIf(!enabled)('keeps one payment/REP through concurrent issuance, two loss boundaries, concurrent UUID recovery and exact XML/PDF',async()=>{
 const initial=await snapshot();
 const payment={amount:'58.00',reference:'SYNTHETIC-ONE',payment_form:'03',paid_at:new Date(Date.now()-3600000).toISOString(),idempotency_key:randomUUID()};
 losePayment=true;expect((await routes.register(req(payment),ctx())).status).toBe(502);
 const firstResponse=await routes.register(req(payment),ctx());expect(firstResponse.status).toBe(201);
 const first=await firstResponse.json();expect((await snapshot()).payments).toHaveLength(1);
 expect((await routes.register(req({...payment,idempotency_key:randomUUID()}),ctx())).status).toBe(409);
 loseReceipt=true;
 const pending=routes.stamp(req({}),ctx(first.id));
 try{
  await vi.waitFor(async()=>expect((await snapshot()).calls.stamp).toBe(1),{timeout:10000});
  const during=await snapshot();const firstUuid=Object.keys(during.issued)[0];
  expect((await routes.stamp(req({}),ctx(first.id))).status).toBe(409);
  expect((await routes.recover(req({receipt_uuid:firstUuid}),ctx(first.id))).status).toBe(409);
  expect((await snapshot()).calls.retrieve).toBe(0);
 }finally{await realFetch(base+'/__fixture/release',{method:'POST'});}
 expect((await pending).status).toBe(502);expect(loseReceipt).toBe(false);
 loseRead=true;expect((await routes.read(req(),ctx(first.id))).status).toBe(502);expect(loseRead).toBe(false);
 const firstRead=await routes.read(req(),ctx(first.id));expect(firstRead.status).toBe(200);
 const firstReceipt=await firstRead.json();expect(firstReceipt.receipt_status).toBe('stamped');
 expect((await routes.stamp(req({}),ctx(first.id))).status).toBe(409);
 const secondResponse=await routes.register(req({...payment,reference:'SYNTHETIC-TWO',idempotency_key:randomUUID()}),ctx());
 expect(secondResponse.status).toBe(201);const second=await secondResponse.json();
 const before=await snapshot();
 expect((await routes.stamp(req({}),ctx(second.id))).status).toBe(502);
 expect((await routes.stamp(req({}),ctx(second.id))).status).toBe(409);
 expect((await routes.recover(req({receipt_uuid:firstReceipt.receipt_uuid}),ctx(second.id))).status).toBe(409);
 const issued=await snapshot();expect(issued.calls.stamp).toBe(2);
 const uuid=Object.keys(issued.issued).find(value=>value!==firstReceipt.receipt_uuid)!;
 const recovery=await Promise.all([routes.recover(req({receipt_uuid:uuid}),ctx(second.id)),routes.recover(req({receipt_uuid:uuid}),ctx(second.id))]);
 expect(recovery.map(r=>r.status)).toEqual([200,200]);
 const recovered=await recovery[0].json();expect(recovered.receipt_uuid).toBe(uuid);
 const count=(await snapshot()).calls.retrieve;
 expect((await routes.recover(req({receipt_uuid:uuid}),ctx(second.id))).status).toBe(200);
 expect((await snapshot()).calls.retrieve).toBe(count);
 const xml=await routes.read(new Request('http://cotiza.test/rep?download=1'),ctx(second.id));
 expect(xml.status).toBe(200);const exact=await xml.text();expect(exact).toBe(issued.issued[uuid]);
 expect(exact).toContain('NumParcialidad="2"');expect(exact).toContain('ImpSaldoAnt="58.00"');expect(exact).toContain('ImpSaldoInsoluto="0.00"');
 expect(exact).toContain('BaseDR="50.000000"');expect(exact).toContain('ImporteDR="8.00"');
 const printed=await routes.pdf(new Request('http://cotiza.test/pdf?expected_uuid='+uuid),ctx(second.id));
 expect(printed.status).toBe(200);const pdf=Buffer.from(await printed.arrayBuffer());expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
 const {extractText}=await import('unpdf');const content=await extractText(new Uint8Array(pdf),{mergePages:true});expect(content.text).toContain(uuid);
 const summary=await(await routes.summary(req(),ctx())).json();expect(summary).toMatchObject({paid:'116.00',balance:'0.00',fiscal_complete:true,receipts_pending_count:0});
 identity.user='foreign-seller';expect((await routes.read(req(),ctx(second.id))).status).toBe(404);identity.user='synthetic-seller';
 identity.tenant='foreign-tenant';expect((await routes.read(req(),ctx(second.id))).status).toBe(403);identity.tenant='rep-acceptance';
 const end=await snapshot();expect(end.payments).toHaveLength(2);expect(end.receipts).toHaveLength(2);expect(end.recovered_acts).toBe(1);
 expect(end.invoice_unchanged).toBe(true);expect(end.calls.stamp).toBe(2);
 expect(end.payments.map(p=>p.declaration_hash)).toEqual(before.payments.map(p=>p.declaration_hash));
 const local=await db.proposals.findUniqueOrThrow({where:{proposal_id:'rep-acceptance-proposal'}});
 expect(local.invoice_xml_base64).toBe(initial.invoice.xmlBase64);expect(local.invoice_uuid).toBe(initial.invoice.uuid);
 if(process.env.REP_ACCEPTANCE_ARTIFACTS){const {mkdir,writeFile}=await import('node:fs/promises');const folder=process.env.REP_ACCEPTANCE_ARTIFACTS;
  await mkdir(folder,{recursive:true});await writeFile(folder+'/result.json',JSON.stringify({synthetic:true,passed:true,calls:end.calls,payments:end.payments,recovered_acts:end.recovered_acts,
   original_invoice_unchanged:true,receipt_uuid:uuid,accepted_xml_sha256:hash(issued.issued[uuid]),recovered_xml_sha256:hash(exact),balance:summary.balance,paid:summary.paid,
   interruptions:['payment_http_response','receipt_http_response','receipt_read','provider_response_before_persistence']},null,2));}
},45000);
