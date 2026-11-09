/** Render the real invoice/classification components with synthetic HTTP fixtures.
 * No Clerk, database, Digestor or PAC credentials; screenshots contain test data only.
 */
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
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-classification-ui-'));
const artifacts = path.resolve(process.env.FISCAL_UI_SCREENSHOTS || 'artifacts/ppd-cycle');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProposalPaymentPanel} from ${JSON.stringify(root+'components/propuestas/proposal-payment-panel.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-4"><h1 className="mb-3 text-lg font-bold">Ensayo sintético · Pagos PPD</h1><p className="mb-4 text-sm">Sin validez fiscal · API simulada · no conectado al PAC</p><ProposalPaymentPanel proposalId="synthetic"/></main>);`,
  loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic', tsconfig: root+'tsconfig.json',
  outfile: out+'/app.js', define: { 'process.env.NODE_ENV': '"production"' } });
const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })])
  .process('@import "tailwindcss";', { from: root+'app/globals.css' });
await writeFile(out+'/app.css', css.css);
if (process.env.FISCAL_UI_BUILD_ONLY === 'true') {
  console.log(JSON.stringify({ built: true, mode: 'synthetic', output: out }));
  process.exit(0);
}
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = pathname === '/app.js' ? 'app.js' : pathname === '/app.css' ? 'app.css' : null;
  if (!file && pathname !== '/') { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file?.endsWith('.js') ? 'text/javascript' : file ? 'text/css' : 'text/html');
  res.end(file ? await readFile(out+'/'+file) : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body style="background:#f4f4f5;font-family:Arial"><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const uuid1='11111111-2222-4333-8444-555555555555',uuid2='22222222-2222-4333-8444-555555555555';
let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [1360,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],unexpected=[],counts={register:0,stamp:0,recover:0};
  const payments=[],keys=new Map();let lostRegistration=false;
  const summary=()=>({supported:true,environment:'sandbox',invoice_uuid:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',total:'116.00',paid:(payments.length*58).toFixed(2),balance:(116-payments.length*58).toFixed(2),
   invoice_fiscal_ready:true,receipt_stamp_enabled:true,economic_settled:payments.length===2,receipts_pending_count:payments.filter(p=>p.receipt_status!=='stamped').length,
   fiscal_complete:payments.length===2&&payments.every(p=>p.receipt_status==='stamped'),payments});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname.endsWith('/payments')){
    if(request.method()==='POST'){
     counts.register++;const body=request.postDataJSON();
     if(!keys.has(body.idempotency_key)){
      const p={id:'pay-'+(payments.length+1),sequence:payments.length+1,reference:body.reference,amount:'58.00',balance_after:payments.length?'0.00':'58.00',receipt_status:'not_sent'};
      keys.set(body.idempotency_key,p);payments.push(p);
     }
     if(!lostRegistration){lostRegistration=true;return route.abort('failed');}
     return route.fulfill({json:keys.get(body.idempotency_key)});
    }
    return route.fulfill({json:summary()});
   }
   if(url.pathname.endsWith('/receipt/stamp')){
    counts.stamp++;const payment=payments.find(p=>url.pathname.includes('/'+p.id+'/'));
    if(payment.id==='pay-2'){payment.receipt_status='unknown';return route.abort('failed');}
    payment.receipt_status='stamped';payment.receipt_uuid=uuid1;payment.fiscal_ready=true;
    return route.fulfill({json:{ok:true,...payment}});
   }
   if(url.pathname.endsWith('/receipt/reconcile')){
    counts.recover++;assert.deepEqual(request.postDataJSON(),{receipt_uuid:uuid2});
    payments[1].receipt_status='stamped';payments[1].receipt_uuid=uuid2;payments[1].fiscal_ready=true;
    return route.fulfill({json:payments[1]});
   }
   unexpected.push(url.pathname);return route.fulfill({status:500,json:{error:'Unexpected synthetic operation'}});
  });
  const button=name=>page.getByRole('button',{name,exact:true});
  const capture=async state=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow ${width} ${state}`);await page.screenshot({path:path.join(artifacts,`ppd-${width}-${state}.png`),fullPage:true});};
  async function fill(reference,date){await page.getByLabel('Importe MXN',{exact:true}).fill('58.00');await page.getByLabel('Referencia bancaria o de recibo',{exact:true}).fill(reference);await page.getByLabel('Fecha y hora recibida (zona de este dispositivo)',{exact:true}).fill(date);}
  await page.goto(origin);await page.getByLabel('Importe MXN',{exact:true}).waitFor();
  await fill('SINTETICO-1','2026-11-08T10:00');await button('Registrar pago recibido').click();
  await page.getByRole('alert').waitFor();await button('Consultar saldo y estado').click();
  await page.getByText('Pago 1: $58.00',{exact:true}).waitFor();
  await button('Registrar pago recibido').click();assert.equal(payments.length,1);
  await button('Timbrar complemento en pruebas').click();await page.getByText('Complemento timbrado',{exact:true}).waitFor();await capture('partial');
  await fill('SINTETICO-2','2026-11-08T11:00');await button('Registrar pago recibido').click();
  await page.getByText('El saldo está liquidado, pero hay complementos por resolver. Consulta el estado de cada pago.',{exact:true}).waitFor();
  await button('Timbrar complemento en pruebas').click();await page.getByText('Timbrado pendiente de confirmar',{exact:true}).waitFor();
  assert.equal(await button('Timbrar complemento en pruebas').count(),0);await capture('settled-pending');
  await button('Consultar saldo y estado').click();await page.getByLabel('UUID del complemento confirmado por el proveedor',{exact:true}).fill(uuid2);
  await button('Recuperar XML sin volver a timbrar').click();await page.getByText('Saldo liquidado y complementos completos.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Descargar XML timbrado',exact:true}).count(),2);
  assert.equal(await page.getByRole('link',{name:'Descargar PDF',exact:true}).count(),2);await capture('complete');
  assert.deepEqual(counts,{register:3,stamp:2,recover:1});assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  results.push({width,counts,errors,unexpected,paid:'116.00',balance:'0.00',fiscal_complete:true});await page.close();
 }
 await writeFile(path.join(artifacts,'result.json'),JSON.stringify({synthetic:true,results},null,2));console.log(JSON.stringify({synthetic:true,results}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
