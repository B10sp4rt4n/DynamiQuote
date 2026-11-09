// Never enabled by the ordinary suite. Real QA HTTP, real route handlers and local SQL.
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { readInvoiceStamp } from '@/lib/domain/invoice-stamp';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/tenant-context',()=>({getCurrentTenantContext:async()=>({
 id:'90dbf915-de98-4ebb-b88c-f27b6e8c645a',name:'Cotiza Lab — PRUEBAS',userId:'local-recovery-qa',userRole:'user',authMode:'clerk',
})}));
const enabled=process.env.COTIZA_LAB_RECOVERY_ENABLED==='true';
const qa='https://digestor-cotiza-lab-production.up.railway.app';
const tenant='90dbf915-de98-4ebb-b88c-f27b6e8c645a';
let proposal='lab-response-loss-'+randomUUID();
const nativeFetch=globalThis.fetch;
let db:typeof import('@/lib/db/prisma').prisma,server:Server,origin:string;
let finish:()=>void,done:Promise<void>,draftId='',acceptedUuid='',acceptedXml='',started=false,starting=false,failReadOnce=true;
const remote:Array<{method:string;path:string;status:number;lost?:boolean}>=[];
const incoming:Array<{method:string;path:string;status:number}>=[];
let stampCalls=0,remoteReadCalls=0;
let resumed=false;
let stamp:typeof import('@/app/api/proposals/[proposalId]/invoice/stamp/route').POST;
let reconcile:typeof import('@/app/api/proposals/[proposalId]/invoice/reconcile/route').POST;
let invoice:typeof import('@/app/api/proposals/[proposalId]/invoice/route').GET;
let xml:typeof import('@/app/api/proposals/[proposalId]/invoice/xml/route').GET;
let pdf:typeof import('@/app/api/proposals/[proposalId]/invoice/pdf/route').GET;
let createDraft:typeof import('./digestor-fiscal').createBillingDraft;
const context=()=>({params:Promise.resolve({proposalId:proposal})});
const folder=()=>process.env.COTIZA_LAB_RECOVERY_EVIDENCE!;
const request=(endpoint:string,body?:unknown)=>new Request(origin+endpoint,{method:'POST',headers:{origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const row=()=>db.proposals.findUniqueOrThrow({where:{proposal_id:proposal}});
const save=async(extra:Record<string,unknown>={})=>writeFile(path.join(folder(),'resultado.json'),JSON.stringify({
 mode:'real-lab-digestor-and-pac / disposable-cotiza-sql / synthetic-local-identity',
 production_changed:false,tenant_id:tenant,proposal_id:proposal,draft_id:draftId,invoice_uuid:acceptedUuid,
 stamp_calls:stampCalls,stamp_result_calls:remoteReadCalls,remote_http:remote,local_http:incoming,...extra,
},null,2));

beforeAll(async()=>{
 if(!enabled)return;
 const url=new URL(process.env.DATABASE_URL!);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Only disposable loopback Cotiza SQL permitted');
 if(process.env.DIGESTOR_FISCAL_SANDBOX_BASE_URL!==qa||process.env.DIGESTOR_FISCAL_SANDBOX_TENANT_ID!==tenant||process.env.DIGESTOR_FISCAL_BASE_URL)throw Error('Only dedicated Cotiza Lab is permitted');
 if(process.env.COTIZA_LAB_RECOVERY_RESUME){
  const checkpoint=process.env.COTIZA_LAB_RECOVERY_RESUME;
  const prior=JSON.parse(await readFile(path.join(checkpoint,'resultado.json'),'utf8'));
  const saved=JSON.parse(await readFile(path.join(checkpoint,'remote-before.json'),'utf8'));
  if(prior.tenant_id!==tenant||saved.company_id!==tenant||saved.id!==prior.draft_id||saved.stamp_status!=='stamped'||prior.stamp_calls!==1)throw Error('Invalid QA checkpoint');
  proposal=prior.proposal_id;draftId=prior.draft_id;acceptedXml=saved.stamped_xml_base64;acceptedUuid=readInvoiceStamp(acceptedXml).uuid;
  stampCalls=1;remote.push(...prior.remote_http);incoming.push(...prior.local_http);resumed=true;
  await writeFile(path.join(folder(),'aceptacion-remota.xml'),Buffer.from(acceptedXml,'base64'));
  await writeFile(path.join(folder(),'checkpoint-original.json'),JSON.stringify({prior,remote_before:{id:saved.id,company_id:saved.company_id,status:saved.status,stamp_status:saved.stamp_status,stamped_at:saved.stamped_at,total:saved.total}},null,2));
 }
 ({prisma:db}=await import('@/lib/db/prisma'));
 await db.tenant.create({data:{tenant_id:tenant,slug:'local-recovery-qa',name:'LAB RECUPERACION LOCAL',created_at:new Date()}});
 ({POST:stamp}=await import('@/app/api/proposals/[proposalId]/invoice/stamp/route'));
 ({POST:reconcile}=await import('@/app/api/proposals/[proposalId]/invoice/reconcile/route'));
 ({GET:invoice}=await import('@/app/api/proposals/[proposalId]/invoice/route'));
 ({GET:xml}=await import('@/app/api/proposals/[proposalId]/invoice/xml/route'));
 ({GET:pdf}=await import('@/app/api/proposals/[proposalId]/invoice/pdf/route'));
 ({createBillingDraft:createDraft}=await import('./digestor-fiscal'));
 globalThis.fetch=async(input,init)=>{
  const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const method=init?.method??(input instanceof Request?input.method:'GET');
  if(u.origin!==qa||u.search&&u.pathname!=='/v1/billing/provider/status')throw Error('Outbound destination blocked by QA harness');
  const allowed=(method==='POST'&&u.pathname==='/auth/login')||(method==='GET'&&u.pathname==='/v1/billing/provider/status')
   ||(method==='POST'&&u.pathname==='/v1/billing/drafts'&&!draftId)
   ||(draftId&&method==='POST'&&u.pathname===`/v1/billing/drafts/${draftId}/stamp`)
   ||(draftId&&method==='GET'&&u.pathname===`/v1/billing/drafts/${draftId}/stamp-result`);
  if(!allowed)throw Error('Unexpected QA operation blocked');
  if(u.pathname.endsWith('/stamp')&&++stampCalls>1)throw Error('Second remote stamp forbidden');
  if(u.pathname.endsWith('/stamp-result')){
   remoteReadCalls++;
   if(failReadOnce){failReadOnce=false;remote.push({method,path:u.pathname,status:0,lost:true});await save({phase:'recovery-read-deliberately-lost'});throw Error('Intentional local read interruption');}
  }
  const response=await nativeFetch(input,{...init,redirect:'error',signal:init?.signal??AbortSignal.timeout(60000)});
  remote.push({method,path:u.pathname,status:response.status});
  if(u.pathname.endsWith('/stamp')){
   const value=await response.clone().json();
   if(!response.ok||value.ok!==true||!value.xml_base64)throw Error('QA acceptance not confirmed; stop without retry');
   acceptedUuid=readInvoiceStamp(value.xml_base64).uuid;acceptedXml=value.xml_base64;
   await writeFile(path.join(folder(),'aceptacion-remota.xml'),Buffer.from(acceptedXml,'base64'));
   await save({phase:'accepted-remotely-response-deliberately-lost'});
   throw Error('Intentional local response loss after QA acceptance');
  }
  await save({phase:'running'});return response;
 };
 const require=createRequire(path.join(process.cwd(),'package.json'));
 const {build}=await import(process.env.ESBUILD_MODULE!);
 const assets=path.join(folder(),'ui');await mkdir(assets);
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ProposalInvoicePanel}from${JSON.stringify(path.join(process.cwd(),'components/propuestas/proposal-invoice-panel.tsx'))};
 const s=await(await fetch('/__state')).json();document.getElementById('uuid').textContent=s.invoice_uuid||'Pendiente de emisión de ensayo';
 if(s.started){document.getElementById('start').hidden=true;createRoot(document.getElementById('root')).render(<ProposalInvoicePanel proposalId=${JSON.stringify(proposal)} recipientCompany="ESCUELA KEMPER URGATE"/>)}
 document.getElementById('start').onclick=async()=>{const b=document.getElementById('start');b.disabled=true;const r=await fetch('/__start',{method:'POST'});const j=await r.json();if(r.ok)location.reload();else document.getElementById('status').textContent=j.error};
 document.getElementById('finish').onclick=async()=>{const r=await fetch('/__finish',{method:'POST'});const j=await r.json();document.getElementById('status').textContent=j.message||j.error};`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'esm',jsx:'automatic',tsconfig:path.join(process.cwd(),'tsconfig.json'),outfile:path.join(assets,'app.js'),define:{'process.env.NODE_ENV':'"production"'}});
 const css=await require('postcss')([require('@tailwindcss/postcss')({base:process.cwd()})]).process('@import "tailwindcss";',{from:path.join(process.cwd(),'app/globals.css')});
 await writeFile(path.join(assets,'app.css'),css.css);
 done=new Promise(resolve=>{finish=resolve;});
 server=createServer(async(req,res)=>{
  const pathname=new URL(req.url!,'http://127.0.0.1').pathname;
  try{
   let response:Response;
   if(pathname==='/'){
    response=new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body style="font-family:Arial;background:#f4f4f5"><main class="mx-auto max-w-5xl p-4"><h1 class="text-xl font-bold">Cotiza Lab · Recuperación de respuesta perdida</h1><p class="my-3">SIN VALIDEZ FISCAL · Digestor y PAC de pruebas · Cotiza e identidad aislados para este ensayo.</p><p>UUID aceptado por el PAC: <strong id="uuid"></strong></p><button id="start" class="my-4 rounded border bg-white p-3">Iniciar ensayo de respuesta perdida</button><div id="root" class="mt-4"></div><button id="finish" class="my-4 rounded border bg-white p-3">Finalizar verificación</button><p id="status" role="status"></p></main><script type="module" src="/app.js"></script></body></html>`,{headers:{'Content-Type':'text/html'}});
   }else if(['/app.js','/app.css'].includes(pathname))response=new Response(await readFile(path.join(assets,pathname.slice(1))),{headers:{'Content-Type':pathname.endsWith('.js')?'text/javascript':'text/css'}});
   else if(pathname==='/__state')response=Response.json({started,proposal_id:proposal,invoice_uuid:acceptedUuid,stamp_calls:stampCalls});
   else if(pathname==='/__start'&&req.method==='POST'){
    if(starting||started)throw Error('Ensayo ya iniciado; no repetir');starting=true;
    if(resumed){
     await db.proposals.create({data:{proposal_id:proposal,tenant_id:tenant,status:'approved',outcome:'won',created_by:'local-recovery-qa',created_by_user_id:'local-recovery-qa',invoice_draft_id:draftId,invoice_status:'stamping',created_at:new Date()}});
     expect((await stamp(request('/api/stamp',{expectedDraftId:draftId,confirm:true}),context())).status).toBe(409);expect(stampCalls).toBe(1);
     started=true;await save({phase:'resumed-same-protected-invoice',resumed:true,retry_status:409});response=Response.json({started:true});
    }else{
    const draft=await createDraft({currency:'MXN',customerName:'ESCUELA KEMPER URGATE',customerRfc:'EKU9003173C9',customerRegimen:'603',customerZip:'42501',customerUseCfdi:'G03',
     emitterRfc:'IIA040805DZ4',emitterName:'INDISTRIA ILUMINADORA DE ALMACENES',emitterRegimen:'626',placeOfIssue:'32690',paymentMethod:'PUE',paymentForm:'03',
     notes:`LAB RESPUESTA PERDIDA ${proposal}`,items:[{description:'ENSAYO DE RECUPERACION SIN VALIDEZ FISCAL',quantity:1,unitPrice:100,satProductCode:'80101500',unitCode:'E48',taxRate:0.16}]});
    draftId=draft.id;expect(draft.readyToStamp).toBe(true);
    await db.proposals.create({data:{proposal_id:proposal,tenant_id:tenant,status:'approved',outcome:'won',created_by:'local-recovery-qa',created_by_user_id:'local-recovery-qa',invoice_draft_id:draftId,invoice_status:'draft',created_at:new Date()}});
    const outcomes=await Promise.all([stamp(request('/api/stamp',{expectedDraftId:draftId,confirm:true}),context()),stamp(request('/api/stamp',{expectedDraftId:draftId,confirm:true}),context())]);
    expect(outcomes.map(r=>r.status).sort()).toEqual([409,502]);expect((await row()).invoice_status).toBe('stamping');expect(stampCalls).toBe(1);
    expect((await stamp(request('/api/stamp',{expectedDraftId:draftId,confirm:true}),context())).status).toBe(409);
    started=true;await save({phase:'protected-awaiting-ui-recovery',concurrent_stamp_statuses:outcomes.map(r=>r.status),retry_status:409});response=Response.json({started:true});
    }
   }else if(pathname==='/__finish'&&req.method==='POST'){
    const saved=await row();expect(saved.invoice_status).toBe('stamped');expect(saved.invoice_uuid).toBe(acceptedUuid);expect(saved.invoice_xml_base64).toBe(acceptedXml);expect(stampCalls).toBe(1);expect(remoteReadCalls).toBe(2);
    const queriesBefore=remoteReadCalls;
    expect((await reconcile(request('/api/reconcile'),context())).status).toBe(200);
    expect((await stamp(request('/api/stamp',{expectedDraftId:draftId,confirm:true}),context())).status).toBe(409);
    expect((await reconcile(request('/api/reconcile',{expectedDraftId:draftId,invoiceUuid:'11111111-2222-4333-8444-555555555555',confirm:true}),context())).status).toBe(409);
    expect(remoteReadCalls).toBe(queriesBefore);expect(stampCalls).toBe(1);
    await save({result:'passed',phase:'completed',resumed,same_uuid:true,same_xml:true,xml_sha256:createHash('sha256').update(Buffer.from(acceptedXml,'base64')).digest('hex'),repeated_recovery_status:200,repeated_stamp_status:409,foreign_uuid_status:409,identity:'local synthetic Clerk-shaped context, not a live Clerk session',cotiza_database:'disposable local PGlite, not deployed commercial database'});
    response=Response.json({message:'Verificación completada: mismo UUID y XML, una sola emisión.'});finish();
   }else if(pathname.startsWith(`/api/proposals/${proposal}/invoice`)){
    const body=req.method==='POST'?await new Promise<string>((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>resolve(s));req.on('error',reject);}):undefined;
    const requestUrl=origin+req.url!;
    const requestObject=new Request(requestUrl,{method:req.method,headers:{...(req.headers.origin?{origin:req.headers.origin}:{}),'Content-Type':'application/json'},...(body?{body}: {})});
    const suffix=pathname.slice(`/api/proposals/${proposal}/invoice`.length);
    if(suffix===''&&req.method==='GET')response=await invoice(requestObject,context());
    else if(suffix==='/reconcile'&&req.method==='POST')response=await reconcile(requestObject,context());
    else if(suffix==='/xml'&&req.method==='GET')response=await xml(requestObject,context());
    else if(suffix==='/pdf'&&req.method==='GET')response=await pdf(requestObject,context());
    else if(suffix==='/production-cancellation'&&req.method==='GET')response=Response.json({enabled:false});
    else response=Response.json({error:'No habilitado en este ensayo'},{status:404});
   }else response=new Response('Not found',{status:404});
   incoming.push({method:req.method!,path:pathname,status:response.status});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error('QA harness:',error instanceof Error?error.message:'unknown');res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'El ensayo se detuvo. Revisa evidencia; no repitas la emisión.'}));await save({result:'stopped'});}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 console.log(JSON.stringify({qa_ui:origin,mode:'lab-response-loss',evidence:folder()}));
},60000);
afterAll(async()=>{if(!enabled)return;globalThis.fetch=nativeFetch;if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(db)await db.$disconnect();});
it.skipIf(!enabled)('recovers one sandbox invoice through real HTTP routes after a lost response',async()=>{await done;},600000);
