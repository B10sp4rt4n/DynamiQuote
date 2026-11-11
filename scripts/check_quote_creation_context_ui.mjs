/** Browser regression of the real QuoteShell/editor with synthetic HTTP only. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../cotiza-web/',import.meta.url));
const require=createRequire(root+'package.json');
const {build}=require(process.env.ESBUILD_MODULE||'esbuild');
const out=await mkdtemp(path.join(tmpdir(),'quote-context-'));
const artifacts=path.resolve(process.env.QUOTE_CONTEXT_SCREENSHOTS||'artifacts/quote-context');
await mkdir(artifacts,{recursive:true});
const quote=(id,group,client)=>({quoteId:id,quoteGroupId:group,clientName:client,proposalName:'Servicio sintético',createdAt:'2026-11-10T12:00:00Z',playbookName:'General',status:'draft',version:1,versionCount:1,totalRevenue:0,avgMargin:0});
const old=quote('old-quote','COT-OLD','Empresa anterior'),fresh=quote('new-quote','COT-NEW','Empresa nueva');
await writeFile(out+'/navigation.tsx',`import {useMemo,useSyncExternalStore} from 'react';
const listeners=new Set<()=>void>();
const snapshot=()=>window.location.search;
const update=(url:string)=>{window.history.replaceState({},'',url);listeners.forEach(listener=>listener());};
const router={replace:update,push:update,refresh:()=>{}};
export const useRouter=()=>router;
export const usePathname=()=>'/cotizaciones';
export const useSearchParams=()=>{const search=useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener);},snapshot,snapshot);return useMemo(()=>new URLSearchParams(search),[search]);};`);
await writeFile(out+'/link.tsx',`import React from 'react';export default function Link({children,...props}:React.ComponentProps<'a'>){return <a {...props}>{children}</a>;}`);
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{QuoteShell}from${JSON.stringify(root+'components/cotizador/quote-shell.tsx')};
const old=${JSON.stringify(old)};createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-6xl p-3"><p>Ensayo sintético · Sin datos reales</p><QuoteShell items={[old]} requestedQuote={location.search.includes('quoteId=old-quote')?old:null} tenantName="Empresa de prueba"/></main>);`,loader:'tsx',resolveDir:root},bundle:true,jsx:'automatic',tsconfig:root+'tsconfig.json',outfile:out+'/app.js',alias:{'next/navigation':out+'/navigation.tsx','next/link':out+'/link.tsx'},define:{'process.env.NODE_ENV':'"production"'}});
const css=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process('@import "tailwindcss";',{from:root+'app/globals.css'});
await writeFile(out+'/app.css',css.css);
const server=createServer(async(req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;const file=pathname==='/app.js'?'app.js':pathname==='/app.css'?'app.css':null;
 if(!file&&pathname!=='/cotizaciones'){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html');res.end(file?await readFile(out+'/'+file):'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body style="font-family:Arial;background:#fafafa"><div id="root"></div><script src="/app.js"></script></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [1360,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],unexpected=[],writes=[],oldReads=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(req.method()!=='GET'){
    writes.push({path:url.pathname,body:req.postDataJSON()});
    if(url.pathname==='/api/quotes'&&req.method()==='POST')return route.fulfill({json:{quote:fresh},status:201});
    unexpected.push(req.method()+' '+url.pathname);return route.abort();
   }
   if(url.href.includes('old-quote'))oldReads.push(url.pathname);
   if(url.pathname==='/api/clients')return route.fulfill({json:{clients:[]}});
   if(url.pathname==='/api/commercial-context'){const isOld=url.searchParams.get('quoteId')==='old-quote';return route.fulfill({json:{context:{opportunityId:isOld?'old-opp':'new-opp',opportunityNumber:isOld?'OPP-OLD':'OPP-NEW',title:isOld?'Negocio anterior':'Negocio nuevo',quoteId:isOld?'old-quote':'new-quote'}}});}
   if(url.pathname.endsWith('/opportunity')){const isOld=url.pathname.includes('/old-quote/');return route.fulfill({json:{opportunity:{opportunityId:isOld?'old-opp':'new-opp',opportunityNumber:isOld?'OPP-OLD':'OPP-NEW',clientCompany:isOld?'Empresa anterior':'Empresa nueva',title:isOld?'Negocio anterior':'Negocio nuevo',need:'',source:'',nextStep:'',revision:0,managed:true,missingFields:['Necesidad','Origen']}}});}
   if(url.pathname.endsWith('/lines'))return route.fulfill({json:{lines:[]}});
   if(url.pathname.endsWith('/versions'))return route.fulfill({json:{versions:[]}});
   unexpected.push(url.pathname);return route.abort();
  });
  await page.goto(origin+'/cotizaciones');
  await page.getByRole('heading',{name:'Nueva cotización',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Oportunidad de la cotización',{exact:true}).count(),0);assert.deepEqual(oldReads,[]);
  await page.getByLabel('Cliente de la cotización',{exact:true}).fill('Empresa nueva');
  await page.getByLabel('Nombre de propuesta',{exact:true}).fill('Servicio nuevo');
  await page.screenshot({path:path.join(artifacts,`fresh-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Crear cotizacion',exact:true}).click();
  await page.getByText('OPP-NEW · Datos de oportunidad pendientes',{exact:true}).waitFor();
  assert.equal(writes.length,1);assert.equal(writes[0].body.opportunityMode,'new');assert.equal(writes[0].body.clientName,'Empresa nueva');assert.equal(writes[0].body.opportunityId,undefined);assert.deepEqual(oldReads,[]);
  assert.equal(await page.getByLabel('Alta de nueva cotización',{exact:true}).isVisible(),false);
  await page.goto(origin+'/cotizaciones?quoteId=old-quote');
  await page.getByRole('button',{name:'Completar datos de la oportunidad',exact:true}).click();
  await page.getByLabel('Nombre de oportunidad',{exact:true}).fill('Avance sin guardar');
  await page.getByRole('button',{name:'Nueva cotización',exact:true}).click();
  await page.getByLabel('Cliente de la cotización',{exact:true}).fill('Otro cliente');
  assert.equal(await page.getByLabel('Contexto de la cotización seleccionada',{exact:true}).isVisible(),false);
  assert.equal(await page.getByLabel('Partidas de la cotización seleccionada',{exact:true}).isVisible(),false);
  assert.equal(new URL(page.url()).searchParams.has('quoteId'),false);
  await page.screenshot({path:path.join(artifacts,`separated-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Volver a cotización seleccionada',exact:true}).click();
  assert.equal(await page.getByLabel('Nombre de oportunidad',{exact:true}).inputValue(),'Avance sin guardar');
  assert.equal(writes.length,1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);results.push({width,creates:writes.length,errors,unexpected});await page.close();
 }
 await writeFile(path.join(artifacts,'result.json'),JSON.stringify({synthetic:true,results},null,2));console.log(JSON.stringify({synthetic:true,results}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
