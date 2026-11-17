// Real React panels, synthetic HTTP responses only. No operational data or emails.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../cotiza-web/', import.meta.url));
const require = createRequire(root + 'package.json');
const { build } = require(process.env.ESBUILD_MODULE || 'esbuild');
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-recurring-ui-'));
const artifacts = path.resolve(process.env.RECURRING_UI_SCREENSHOTS || 'artifacts/recurring-services');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {RecurringServicesPanel} from ${JSON.stringify(root + 'components/servicios/recurring-services-panel.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-4"><RecurringServicesPanel tenantId="synthetic-tenant"/></main>);`, loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic', tsconfig: root + 'tsconfig.json', outfile: out + '/app.js',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{name:'next-link',setup(builder){builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'synthetic-next'}));builder.onLoad({filter:/.*/,namespace:'synthetic-next'},()=>({contents:`import React from 'react';export default function Link(props){return React.createElement('a',props);}`,resolveDir:root}));}}] });
const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process('@import "tailwindcss";', { from: root + 'app/globals.css' });
await writeFile(out + '/app.css', css.css);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = url.pathname === '/app.js' ? 'app.js' : url.pathname === '/app.css' ? 'app.css' : null;
  if (!file && url.pathname !== '/') { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file?.endsWith('.js') ? 'text/javascript' : file ? 'text/css' : 'text/html');
  res.end(file ? await readFile(out + '/' + file) : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body style="background:#f4f4f5;font-family:Arial"><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const results=[];let browser;
try {
 for(const width of [1360,390]) {
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage',...(process.env.RECURRING_CHROMIUM_SINGLE_PROCESS?['--single-process','--no-zygote','--no-process-singleton']:[])]});
  const page=await browser.newPage({viewport:{width,height:1000},timezoneId:'America/Mexico_City'}),errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));let agreement=null,drop=false;
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);
   if(!url.pathname.startsWith('/api/'))return route.continue();
   assert.equal(req.headers()['x-tenant-context'],'synthetic-tenant');
   if(req.method()==='GET')return route.fulfill({json:url.pathname.endsWith('/api/recurring-services')&&!url.searchParams.has('requestId')?{agreements:agreement?[agreement]:[],clients:[{id:'synthetic-client',name:'Cliente sintético'}],hasMore:false,clientsTruncated:false}:{agreement}});
   assert.equal(url.pathname,'/api/recurring-services');const body=req.postDataJSON();writes.push(body);
   if(body.action==='create')agreement={id:'11111111-1111-4111-8111-111111111111',number:'SR-0000000001',revision:1,status:'draft',terms:body.terms,missing:[],periods:[],createdAt:'2030-01-01T00:00:00Z',updatedAt:'2030-01-01T00:00:00Z'};
   else if(body.action==='generate')agreement.periods=[{start:'2030-01-31',end:'2030-02-28',prepareOn:'2030-01-31',dueOn:'2030-02-10',termsRevision:1,state:'planned'}];
   else {assert.equal(body.expectedRevision,agreement.revision);agreement.revision++;agreement.status={activate:'active',pause:'paused',resume:'active',end:'ended'}[body.action];}
   agreement.renewalReview={state:agreement.status==='draft'?'draft':agreement.status==='ended'?'ended':'t30',asOf:'2031-01-01',timezone:'America/Mexico_City',endsOn:'2031-01-31',lastCoveredOn:'2031-01-30',daysToEnd:30,noticeOn:'2031-01-01',noticeDue:true,autoRenew:false};
   if(drop){drop=false;return route.abort('failed');}return route.fulfill({json:{agreement}});
  });
  const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow '+width+' '+name);await page.screenshot({path:path.join(artifacts,`recurring-${width}-${name}.png`),fullPage:true});};
  await page.goto(origin);await page.getByText('Aún no hay acuerdos.',{exact:false}).waitFor();await capture('empty');
  await page.getByLabel('Nombre del servicio',{exact:true}).fill('Servicio sintético');await page.getByLabel('Cliente',{exact:true}).selectOption('synthetic-client');
  await page.getByLabel('Modalidad',{exact:true}).selectOption('fixed_term');await page.getByLabel('Renovación pactada',{exact:true}).selectOption('false');
  await page.getByLabel('Inicio del contrato',{exact:true}).fill('2030-01-31');await page.getByLabel('Fin exclusivo (primer día fuera del contrato)',{exact:true}).fill('2031-01-31');await page.getByLabel('Condiciones vigentes desde',{exact:true}).fill('2030-01-31');await page.getByLabel('Preaviso en días',{exact:true}).fill('30');
  await page.getByLabel('Frecuencia',{exact:true}).selectOption('monthly');await page.getByLabel('Momento del cobro',{exact:true}).selectOption('advance');await page.getByLabel('Día ancla',{exact:true}).fill('31');await page.getByLabel('Días de pago desde preparación',{exact:true}).fill('10');await page.getByLabel('Moneda',{exact:true}).selectOption('MXN');
  await page.getByRole('button',{name:'Agregar partida',exact:true}).click();await page.getByLabel('Descripción',{exact:true}).fill('Servicio de prueba');await page.getByLabel('Cantidad',{exact:true}).fill('2');await page.getByLabel('Precio unitario',{exact:true}).fill('125.2500');await page.getByLabel('Referencia de aceptación o contratación',{exact:true}).fill('Contrato sintético');
  await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByRole('heading',{name:'SR-0000000001 · Borrador',exact:true}).waitFor();assert.match(writes[0].requestId,/^[0-9a-f-]{36}$/);assert.equal(writes[0].terms.lines[0].unitPrice,'125.2500');await capture('draft');
  await page.getByLabel('Nombre del servicio',{exact:true}).fill('Cambios sin guardar');assert.equal(await page.getByRole('button',{name:'Activar con evidencia',exact:true}).isDisabled(),true);await page.getByLabel('Nombre del servicio',{exact:true}).fill('Servicio sintético');
  await page.getByLabel('Motivo y evidencia de esta decisión',{exact:true}).fill('Aceptación confirmada');await page.getByRole('button',{name:'Activar con evidencia',exact:true}).click();await page.getByRole('heading',{name:'SR-0000000001 · Activo',exact:true}).waitFor();
  await page.getByText('Renovación · próximos 30 días',{exact:true}).first().waitFor();assert.equal(await page.getByRole('link',{name:'Ver ficha del cliente',exact:true}).getAttribute('href'),'/clientes/synthetic-client');
  await page.getByRole('button',{name:'Registrar periodos',exact:true}).click();await page.getByRole('cell',{name:'28/02/2030',exact:true}).waitFor();await capture('calendar');
  await page.getByLabel('Motivo y evidencia de esta decisión',{exact:true}).fill('Pausa acordada');drop=true;await page.getByRole('button',{name:'Pausar',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Registrar periodos',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Nuevo acuerdo',exact:true}).isDisabled(),true);await capture('uncertain');
  await page.getByRole('button',{name:'Consultar resultado antes de continuar',exact:true}).click();await page.getByRole('heading',{name:'SR-0000000001 · Pausado',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Registrar periodos',exact:true}).isDisabled(),true);
  await page.getByLabel('Motivo y evidencia de esta decisión',{exact:true}).fill('Reanudación acordada');await page.getByLabel('Inicio de periodo o reanudación',{exact:true}).fill('2030-03-31');await page.getByRole('button',{name:'Reanudar desde fecha seleccionada',exact:true}).click();await page.getByRole('heading',{name:'SR-0000000001 · Activo',exact:true}).waitFor();await capture('resumed');
  agreement.renewalReview={...agreement.renewalReview,state:'expired',asOf:'2031-02-01',daysToEnd:-1};await page.reload();await page.getByText('Vigencia contractual cumplida · revisar continuidad',{exact:true}).waitFor();await capture('expired');
  assert.deepEqual(errors,[]);assert.equal(writes.length,5);results.push({width,errors,mutations:writes.length});await browser.close();browser=null;
 }
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({synthetic:true,results},null,2));console.log(JSON.stringify({ok:true,results}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
