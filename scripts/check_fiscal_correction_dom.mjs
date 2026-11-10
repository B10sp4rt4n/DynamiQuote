/** Actual React interaction test in JSDOM. No browser, PAC, accounts or production data.
 * ESBUILD_MODULE and JSDOM_MODULE may point to temporary development installations.
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const require=createRequire(new URL('../cotiza-web/package.json',import.meta.url));
const {build}=require(process.env.ESBUILD_MODULE || 'esbuild');
const {JSDOM}=require(process.env.JSDOM_MODULE || 'jsdom');
const root=path.resolve(new URL('../cotiza-web',import.meta.url).pathname);
const source=`import React from 'react';import{createRoot}from'react-dom/client';
import{ProposalCorrectionPanel}from ${JSON.stringify(root+'/components/propuestas/proposal-correction-panel.tsx')};
createRoot(document.getElementById('root')).render(<ProposalCorrectionPanel proposalId="synthetic"/>);`;
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,
  jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const dom=new JSDOM('<div id="root"></div>',{url:'http://cotiza.test',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom;Object.defineProperty(window.crypto,'randomUUID',{value:randomUUID});
const original='11111111-2222-4333-8444-555555555555',replacement='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let value={active_uuid:original,active_xml_base64:'synthetic',pending:false,kind:'invoice',history:[],defaults:{
  customer_name:'ORIGINAL SINTETICO',customer_zip:'01000',customer_regimen:'601',customer_use_cfdi:'G03',payment_method:'PPD',payment_form:'99'}};
const calls={create:0,stamp:0,cancel:0,query:0};
window.fetch=async (url,init={}) => {
  await new Promise(resolve=>setTimeout(resolve,5));
  const pathname=new URL(url,'http://cotiza.test').pathname;
  if(init.method==='POST'&&pathname.endsWith('/correction')) {
    calls.create++;const input=JSON.parse(init.body);
    assert.equal(input.source_uuid,original);assert.equal(input.changes.customer_name,'CORREGIDO SINTETICO');
    assert.ok(input.idempotency_key);assert.ok(input.reason.length>=5);
    value={...value,pending:true,history:[{id:'revision',source_uuid:original,result_uuid:null,status:'prepared',reason:input.reason,changes:input.changes,source_cancellation_status:'not_requested'}]};
  } else if(pathname.endsWith('/stamp')) {calls.stamp++;value={...value,history:[{...value.history[0],status:'stamped',result_uuid:replacement}]};}
  else if(pathname.endsWith('/cancel-original')) {calls.cancel++;value={...value,history:[{...value.history[0],source_cancellation_status:'requested'}]};}
  else if(pathname.endsWith('/confirm-cancellation')) {calls.query++;value={...value,pending:false,active_uuid:replacement,defaults:{...value.defaults,customer_name:'CORREGIDO SINTETICO'},history:[{...value.history[0],source_cancellation_status:'cancelled'}]};}
  return {ok:true,json:async()=>structuredClone(value)};
};
function button(text){return [...window.document.querySelectorAll('button')].find(el=>el.textContent===text);}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('UI state not reached: '+window.document.body.textContent);}
function field(label){return [...window.document.querySelectorAll('label')].find(el=>el.textContent.includes(label))?.querySelector('input,textarea');}
function input(element,text){const proto=element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,text);element.dispatchEvent(new window.Event('input',{bubbles:true}));}
function confirm(){window.document.querySelector('input[type=checkbox]').click();}
try {
  window.eval(bundle.outputFiles[0].text);
  await until(()=>field('Nombre o razón social'));
  assert.equal(window.document.querySelectorAll('[aria-label="Flujo de sustitución"] li').length,4);
  input(field('Nombre o razón social'),'CORREGIDO SINTETICO');input(field('Motivo de la corrección'),'Corrección sintética revisada');confirm();
  input(field('Nombre o razón social'),'VARIANTE SIN CONFIRMAR');
  await until(()=>button('Preparar sustitución para revisión').disabled);
  input(field('Nombre o razón social'),'CORREGIDO SINTETICO');confirm();
  await until(()=>!button('Preparar sustitución para revisión').disabled);
  button('Preparar sustitución para revisión').click();button('Preparar sustitución para revisión').click();
  await until(()=>button('Timbrar sustituta en pruebas'));
  assert.ok(window.document.querySelector('dl').textContent.includes('CORREGIDO SINTETICO'));
  assert.equal(button('Timbrar sustituta en pruebas').disabled,true);
  confirm();await until(()=>!button('Timbrar sustituta en pruebas').disabled);
  button('Timbrar sustituta en pruebas').click();button('Timbrar sustituta en pruebas').click();
  await until(()=>button('Solicitar cancelación del anterior en pruebas'));
  assert.equal(button('Solicitar cancelación del anterior en pruebas').disabled,true);
  confirm();await until(()=>!button('Solicitar cancelación del anterior en pruebas').disabled);
  button('Solicitar cancelación del anterior en pruebas').click();
  await until(()=>button('Consultar confirmación de cancelación'));
  assert.ok(window.document.body.textContent.includes(original));
  button('Consultar confirmación de cancelación').click();
  await until(()=>window.document.body.textContent.includes('Comprobante seleccionado en Cotiza: '+replacement));
  assert.deepEqual(calls,{create:1,stamp:1,cancel:1,query:1});
  console.log(JSON.stringify({passed:true,mode:'React/JSDOM synthetic HTTP',doubleClicksDeduplicated:true,calls}));
} finally {dom.window.close();}
