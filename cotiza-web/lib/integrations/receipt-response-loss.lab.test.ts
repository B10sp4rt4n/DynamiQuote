// Explicit QA opt-in; real Cotiza HTTP handlers, disposable local SQL, existing Lab Digestor/PAC.
import { afterAll, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/tenant-context',()=>({getCurrentTenantContext:async()=>({id:'90dbf915-de98-4ebb-b88c-f27b6e8c645a',name:'Cotiza Lab — PRUEBAS',userId:'local-rep-recovery-qa',userRole:'user',authMode:'clerk'})}));
const enabled=process.env.COTIZA_LAB_RECOVERY_ENABLED==='true'&&process.env.COTIZA_LAB_RECOVERY_CASE==='rep';
const tenant='90dbf915-de98-4ebb-b88c-f27b6e8c645a',qa='https://digestor-cotiza-lab-production.up.railway.app';
const nativeFetch=globalThis.fetch;
const proposal='lab-rep-response-loss-'+randomUUID();
let draftId='',paymentId='',invoiceUuid='',receiptUuid='',acceptedXml='';
let invoiceStampAttempts=0,receiptStampAttempts=0,receiptAcceptances=0,loseRead=false,responseLossInjected=false;
let server:Server,db:typeof import('@/lib/db/prisma').prisma;
const remote:Array<{method:string;path:string;status:number;response_lost?:boolean}>=[];
const local:Array<{method:string;path:string;status:number}>=[];
const checks:Record<string,unknown>={};
const folder=()=>process.env.COTIZA_LAB_RECOVERY_EVIDENCE!;
const save=async(result='running')=>writeFile(path.join(folder(),'resultado.json'),JSON.stringify({
 result,scenario:'REP response lost after Digestor persisted sandbox acceptance',browser_tested:false,
 cotiza_sql:'disposable loopback PGlite',identity:'synthetic local Clerk-shaped context',production_changed:false,
 tenant_id:tenant,proposal_id:proposal,draft_id:draftId,payment_id:paymentId,invoice_uuid:invoiceUuid,receipt_uuid:receiptUuid,
 invoice_stamp_attempts:invoiceStampAttempts,receipt_stamp_http_attempts:receiptStampAttempts,receipt_accepted_issuances:receiptAcceptances,
 remote_http:remote,local_http:local,checks,
},null,2));
afterAll(async()=>{if(!enabled)return;globalThis.fetch=nativeFetch;if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(db)await db.$disconnect();});

it.skipIf(!enabled)('recovers the same REP and preserves one payment and zero balance after a lost response',async()=>{
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname))throw Error('Disposable local SQL required');
 if(process.env.DIGESTOR_FISCAL_SANDBOX_BASE_URL!==qa||process.env.DIGESTOR_FISCAL_SANDBOX_TENANT_ID!==tenant||process.env.DIGESTOR_FISCAL_BASE_URL)throw Error('Dedicated Lab only');
 ({prisma:db}=await import('@/lib/db/prisma'));
 await db.tenant.create({data:{tenant_id:tenant,slug:'local-rep-recovery-qa',name:'LAB REP RECUPERACION LOCAL',created_at:new Date()}});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const method=init?.method??(input instanceof Request?input.method:'GET');
  if(url.origin!==qa||url.search&&url.pathname!=='/v1/billing/provider/status')throw Error('Non-Lab destination blocked');
  const invoicePath=`/v1/billing/drafts/${draftId}`,payments=invoicePath+'/payments',receipt=payments+'/'+paymentId+'/receipt';
  const allowed=(method==='POST'&&url.pathname==='/auth/login')||(method==='GET'&&url.pathname==='/v1/billing/provider/status')
   ||(method==='POST'&&url.pathname==='/v1/billing/drafts'&&!draftId)
   ||(draftId&&method==='POST'&&url.pathname===invoicePath+'/stamp')
   ||(draftId&&['GET','POST'].includes(method)&&url.pathname===payments)
   ||(paymentId&&method==='GET'&&url.pathname===receipt)
   ||(paymentId&&method==='POST'&&['/prepare','/stamp','/reconcile'].some(s=>url.pathname===receipt+s));
  if(!allowed)throw Error('Unexpected fiscal operation blocked');
  if(url.pathname===invoicePath+'/stamp'&&++invoiceStampAttempts>1)throw Error('Second invoice stamp forbidden');
  if(url.pathname===receipt+'/stamp'&&++receiptStampAttempts>3)throw Error('Additional REP attempts forbidden');
  if(method==='GET'&&url.pathname===receipt&&loseRead){loseRead=false;remote.push({method,path:url.pathname,status:0,response_lost:true});await save();throw Error('Intentional first receipt read interruption');}
  const response=await nativeFetch(input,{...init,redirect:'error',signal:init?.signal??AbortSignal.timeout(60000)});
  const entry={method,path:url.pathname,status:response.status,response_lost:false};remote.push(entry);
  if(url.pathname===receipt+'/stamp'&&response.ok){
   const value=await response.clone().json();expect(value.ok).toBe(true);expect(value.receipt_status).toBe('stamped');
   expect(value.receipt_uuid).toBeTruthy();expect(value.xml_base64).toBeTruthy();
   receiptAcceptances++;expect(receiptAcceptances).toBe(1);receiptUuid=value.receipt_uuid;acceptedXml=value.xml_base64;
   const xml=Buffer.from(acceptedXml,'base64').toString('utf8');
   expect(XMLValidator.validate(xml)).toBe(true);
   const document=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',removeNSPrefix:true}).parse(xml);
   expect(document.Comprobante['@Version']).toBe('4.0');
   expect(document.Comprobante['@TipoDeComprobante']).toBe('P');
   expect(document.Comprobante.Complemento.TimbreFiscalDigital['@UUID'].toLowerCase()).toBe(receiptUuid.toLowerCase());
   await writeFile(path.join(folder(),'rep-aceptado.xml'),Buffer.from(acceptedXml,'base64'));
   entry.response_lost=true;responseLossInjected=true;await save();throw Error('Intentional REP response loss after sandbox acceptance');
  }
  await save();return response;
 };
 const fiscal=await import('./digestor-fiscal');
 const draft=await fiscal.createBillingDraft({currency:'MXN',customerName:'ESCUELA KEMPER URGATE',customerRfc:'EKU9003173C9',customerRegimen:'603',customerZip:'42501',customerUseCfdi:'G03',
  emitterRfc:'IIA040805DZ4',emitterName:'INDISTRIA ILUMINADORA DE ALMACENES',emitterRegimen:'626',placeOfIssue:'32690',paymentMethod:'PPD',paymentForm:'99',
  notes:`LAB RESPUESTA PERDIDA REP ${proposal}`,items:[{description:'ENSAYO REP SIN VALIDEZ FISCAL',quantity:1,unitPrice:100,satProductCode:'80101500',unitCode:'E48',taxRate:0.16}]});
 draftId=draft.id;expect(draft.readyToStamp).toBe(true);await save();
 const stamped=await fiscal.stampBillingDraft(draftId);
 expect(stamped.ok).toBe(true);expect(stamped.uuid).toBeTruthy();expect(stamped.xmlBase64).toBeTruthy();invoiceUuid=stamped.uuid!;
 await writeFile(path.join(folder(),'factura-ppd.xml'),Buffer.from(stamped.xmlBase64!,'base64'));
 await db.proposals.create({data:{proposal_id:proposal,tenant_id:tenant,status:'approved',outcome:'won',created_by:'local-rep-recovery-qa',created_by_user_id:'local-rep-recovery-qa',created_at:new Date(),invoice_draft_id:draftId,invoice_status:'stamped',invoice_uuid:invoiceUuid,invoice_xml_base64:stamped.xmlBase64,invoice_stamped_at:new Date()}});
 const payments=await import('@/app/api/proposals/[proposalId]/invoice/payments/route');
 const receiptRead=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/route');
 const receiptPrepare=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/prepare/route');
 const receiptStamp=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/stamp/route');
 const receiptRecover=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/reconcile/route');
 const receiptPdf=await import('@/app/api/proposals/[proposalId]/invoice/payments/[paymentId]/receipt/pdf/route');
 const ctx=()=>({params:Promise.resolve({proposalId:proposal,paymentId})});
 let origin='';const route=`/api/proposals/${proposal}/invoice/payments`;
 server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,origin);const body=req.method==='POST'?await new Promise<string>((resolve,reject)=>{let value='';req.on('data',c=>value+=c);req.on('end',()=>resolve(value));req.on('error',reject);}):undefined;
   const request=new Request(url,{method:req.method,headers:{origin,'Content-Type':'application/json'},...(body?{body}: {})});
   let response:Response;
   if(url.pathname===route)response=await(req.method==='GET'?payments.GET:payments.POST)(request,ctx());
   else if(url.pathname===route+'/'+paymentId+'/receipt')response=await receiptRead.GET(request,ctx());
   else if(url.pathname===route+'/'+paymentId+'/receipt/prepare')response=await receiptPrepare.POST(request,ctx());
   else if(url.pathname===route+'/'+paymentId+'/receipt/stamp')response=await receiptStamp.POST(request,ctx());
   else if(url.pathname===route+'/'+paymentId+'/receipt/reconcile')response=await receiptRecover.POST(request,ctx());
   else if(url.pathname===route+'/'+paymentId+'/receipt/pdf')response=await receiptPdf.GET(request,ctx());
   else response=new Response('Not found',{status:404});
   local.push({method:req.method!,path:url.pathname,status:response.status});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('QA harness stopped');}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as{port:number}).port}`;
 const call=async(suffix:string,method='GET',body?:unknown)=>{
  const response=await nativeFetch(origin+route+suffix,{method,headers:{origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(70000)});
  return{status:response.status,body:await response.json()};
 };
 const input={idempotency_key:randomUUID(),reference:'LAB-REP-LOSS-'+randomUUID(),amount:'116.00',paid_at:new Date().toISOString(),payment_form:'03'};
 const registered=await call('','POST',input);expect(registered.status).toBe(201);paymentId=registered.body.id;expect(paymentId).toBeTruthy();await save();
 const repeated=await call('','POST',input);expect(repeated.status).toBe(201);expect(repeated.body.id).toBe(paymentId);checks.registration_idempotent=true;
 const before=(await call('')).body;expect(before.payments).toHaveLength(1);expect(before.balance).toBe('0.00');expect(before.fiscal_complete).toBe(false);
 await writeFile(path.join(folder(),'saldo-antes.json'),JSON.stringify(before,null,2));
 const receiptSuffix='/'+paymentId+'/receipt';
 const prepared=await call(receiptSuffix+'/prepare','POST',{});expect(prepared.status).toBe(200);
 await writeFile(path.join(folder(),'rep-preliminar.xml'),Buffer.from(prepared.body.xml_base64,'base64'));
 const concurrent=await Promise.all([call(receiptSuffix+'/stamp','POST',{confirm_real_receipt:false}),call(receiptSuffix+'/stamp','POST',{confirm_real_receipt:false})]);
 // Historical Cotiza maps upstream conflicts to 502; the HTTP-status fix preserves 409.
 // The deliberately lost acceptance must still be a transport failure (502).
 expect(concurrent.some(r=>r.status===502)).toBe(true);
 expect(concurrent.every(r=>[409,502].includes(r.status))).toBe(true);expect(receiptAcceptances).toBe(1);
 expect(responseLossInjected).toBe(true);checks.deliberate_response_loss_injected=true;
 expect(remote.filter(r=>r.path.endsWith(receiptSuffix+'/stamp')).map(r=>r.status).sort()).toEqual([200,409]);
 checks.concurrent_cotiza_http=concurrent.map(r=>r.status);checks.concurrent_digestor_http=[200,409];checks.one_rep_accepted=true;
 const retry=await call(receiptSuffix+'/stamp','POST',{confirm_real_receipt:false});expect([409,502]).toContain(retry.status);expect(remote.at(-1)?.status).toBe(409);expect(receiptAcceptances).toBe(1);checks.retry_blocked_by_digestor=409;
 loseRead=true;expect((await call(receiptSuffix)).status).toBe(502);checks.first_read_interrupted=true;
 const recovered=await call(receiptSuffix);expect(recovered.status).toBe(200);expect(recovered.body.receipt_uuid).toBe(receiptUuid);expect(recovered.body.xml_base64).toBe(acceptedXml);
 for(let i=0;i<2;i++){const r=await call(receiptSuffix+'/reconcile','POST',{receipt_uuid:receiptUuid});expect(r.status).toBe(200);expect(r.body.receipt_uuid).toBe(receiptUuid);expect(r.body.xml_base64).toBe(acceptedXml);}
 const other=await call(receiptSuffix+'/reconcile','POST',{receipt_uuid:invoiceUuid});expect([409,502]).toContain(other.status);expect(remote.at(-1)?.status).toBe(409);checks.foreign_uuid_rejected=true;
 const after=(await call('')).body;expect(after.payments).toHaveLength(1);expect(after.paid).toBe('116.00');expect(after.balance).toBe(before.balance);expect(after.economic_settled).toBe(true);expect(after.fiscal_complete).toBe(true);
 expect(after.payments[0].id).toBe(paymentId);expect(after.payments[0].receipt_uuid).toBe(receiptUuid);expect(after.payments[0].xml_base64).toBe(acceptedXml);
 await writeFile(path.join(folder(),'saldo-despues.json'),JSON.stringify(after,null,2));
 for(const[name,suffix]of[['rep-recuperado.xml',receiptSuffix+'?download=1'],['rep-recuperado.pdf',receiptSuffix+'/pdf']]){
  const response=await nativeFetch(origin+route+suffix,{signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);await writeFile(path.join(folder(),name),Buffer.from(await response.arrayBuffer()));
 }
 expect(await readFile(path.join(folder(),'rep-recuperado.xml'))).toEqual(Buffer.from(acceptedXml,'base64'));
 expect(await readFile(path.join(folder(),'rep-aceptado.xml'))).toEqual(Buffer.from(acceptedXml,'base64'));
 checks.same_uuid=true;checks.same_xml_bytes=true;checks.one_payment_preserved=true;checks.balance_before=before.balance;checks.balance_after=after.balance;checks.fiscal_complete=true;
 checks.xml_sha256=createHash('sha256').update(Buffer.from(acceptedXml,'base64')).digest('hex');
 expect(invoiceStampAttempts).toBe(1);expect(receiptStampAttempts).toBe(3);expect(receiptAcceptances).toBe(1);
 await save('passed');console.log(JSON.stringify({result:'passed',draft_id:draftId,payment_id:paymentId,receipt_uuid:receiptUuid,accepted_reps:receiptAcceptances,balance:after.balance}));
},120000);
