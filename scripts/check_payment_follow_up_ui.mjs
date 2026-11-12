/** Real React panels, isolated HTTP fixtures, no PAC, identity or database. */
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
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-payment-follow-up-'));
const artifacts = path.resolve(process.env.FISCAL_UI_SCREENSHOTS || 'artifacts/payment-follow-up');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProposalPaymentPanel} from ${JSON.stringify(root+'components/propuestas/proposal-payment-panel.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl p-4"><h1 className="text-lg font-bold">Ensayo sintético · Seguimiento de pagos</h1><p>Sin validez fiscal · Sin conexión al PAC</p><ProposalPaymentPanel proposalId="synthetic" cancellationEnabled/></main>);`,
  loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic', tsconfig: root+'tsconfig.json',
  outfile: out+'/app.js', define: { 'process.env.NODE_ENV': '"production"' } });
const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })])
  .process('@import "tailwindcss";', { from: root+'app/globals.css' });
await writeFile(out+'/app.css', css.css);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = pathname === '/app.js' ? 'app.js' : pathname === '/app.css' ? 'app.css' : null;
  if (!file && pathname !== '/') { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file?.endsWith('.js') ? 'text/javascript' : file ? 'text/css' : 'text/html');
  res.end(file ? await readFile(out+'/'+file) : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body style="background:#f4f4f5;font-family:Arial"><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:'+server.address().port;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
const results=[];
try {
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const width of [1360,390]) for(const scenario of ['processing','unknown','ready','cancellation','cancelled-invoice']) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[],writes=[],unexpected=[];
    const first={id:'first',sequence:1,reference:'SYNTHETIC-ONE',amount:'58.00',balance_after:'58.00',receipt_status:'stamped',receipt_uuid:'synthetic-rep-1',fiscal_ready:true,cancellation_status:'not_requested'};
    const second={id:'second',sequence:2,reference:'SYNTHETIC-TWO',amount:'58.00',balance_after:'0.00',receipt_status:scenario==='ready'?'stamped':['processing','unknown'].includes(scenario)?scenario:'not_sent',receipt_uuid:scenario==='ready'?'synthetic-rep-2':null,fiscal_ready:scenario==='ready'};
    const summary={supported:true,environment:'sandbox',receipt_stamp_enabled:true,invoice_fiscal_ready:scenario!=='cancelled-invoice',invoice_cancellation_status:scenario==='cancelled-invoice'?'cancelled':'not_requested',total:'116.00',paid:'116.00',balance:'0.00',payments:[first,second]};
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
      if(!url.pathname.startsWith('/api/'))return route.continue();
      if(req.method()!=='GET') {writes.push(url.pathname);return route.abort();}
      if(url.pathname.endsWith('/payments'))return route.fulfill({json:summary});
      if(url.pathname.endsWith('/cancellation'))return route.fulfill({json:{environment:'sandbox',document_uuid:'synthetic-rep',status:scenario==='cancellation'?'requested':'not_requested',acknowledgement_xml:null}});
      unexpected.push(url.pathname);return route.abort();
    });
    await page.goto(origin);
    const box=page.getByRole('status',{name:'Seguimiento de pagos y complementos',exact:true});
    if(scenario==='cancelled-invoice') {
      await page.getByRole('heading',{name:'Historial de pagos · factura cancelada · pruebas'}).waitFor();
      assert.equal(await box.count(),0);
      assert.equal(await page.getByRole('button',{name:'Registrar pago recibido',exact:true}).count(),0);
    } else {
      await box.getByText('Pago total registrado',{exact:true}).waitFor();
      await box.getByText(scenario==='ready'?'Complementos de los pagos registrados: sin pendientes en Cotiza.':scenario==='cancellation'?'2 pagos con complemento pendiente de emisión, recuperación o revisión.':'1 pago con complemento pendiente de emisión, recuperación o revisión.',{exact:true}).waitFor();
    }
    assert.equal(await page.getByRole('button',{name:'Timbrar complemento en pruebas',exact:true}).count(),0);
    if(['processing','unknown'].includes(scenario))assert.equal(await page.getByRole('button',{name:'Recuperar XML sin volver a timbrar',exact:true}).count(),scenario==='unknown'?1:0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(artifacts,`${scenario}-${width}.png`),fullPage:true});
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(unexpected,[]);
    results.push({width,scenario,errors,writes,unexpected});await page.close();
  }
  await writeFile(path.join(artifacts,'result.json'),JSON.stringify({synthetic:true,results},null,2));
  console.log(JSON.stringify({synthetic:true,results}));
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
