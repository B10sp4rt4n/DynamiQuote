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
const artifacts = path.resolve(process.env.FISCAL_UI_SCREENSHOTS || 'artifacts/invoice-cancelled');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProposalInvoicePanel} from ${JSON.stringify(root+'components/propuestas/proposal-invoice-panel.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-4"><h1 className="mb-3 text-lg font-bold">Ensayo sintético · Factura cancelada</h1><p className="mb-4 text-sm">Sin validez fiscal · API simulada · no conectado al PAC</p><ProposalInvoicePanel canPrepareInvoice={false} proposalId="synthetic" recipientCompany="EMPRESA SINTÉTICA"/></main>);`,
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
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
const results=[];
try {
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [1360,390]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],writes=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(request.method()!=='GET')writes.push(url.pathname);
   if(url.pathname.endsWith('/invoice'))return route.fulfill({json:{ppdEnabled:true,cancellationEnabled:true,correctionsEnabled:false,invoice:{status:'stamped',uuid:'synthetic-cancelled',draftId:'synthetic'}}});
   if(url.pathname.endsWith('/payments'))return route.fulfill({json:{supported:true,environment:'production',total:'1.16',paid:'0.00',balance:'1.16',invoice_fiscal_ready:false,invoice_cancellation_status:'cancelled',payments:[]}});
   if(url.pathname.endsWith('/cancellation'))return route.fulfill({json:{environment:'production',status:'cancelled',document_uuid:'synthetic-cancelled',acknowledgement_xml:'synthetic-ack'}});
   unexpected.push(url.pathname);return route.fulfill({status:500,json:{error:'Unexpected route'}});
  });
  await page.goto(origin);
  await page.getByText('Factura cancelada',{exact:true}).waitFor();
  await page.getByText('Saldo histórico del comprobante:',{exact:false}).waitFor();
  assert.equal(await page.getByText('Hay una sustitución o cancelación pendiente.',{exact:false}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Registrar pago recibido',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Emitir complemento fiscal real',exact:true}).count(),0);
  assert.equal(await page.getByRole('link',{name:'Descargar XML',exact:true}).count(),1);
  assert.equal(await page.getByRole('link',{name:'Descargar acuse de cancelación',exact:true}).count(),1);
  await page.getByRole('button',{name:'Consultar saldo y estado',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(artifacts,`cancelled-${width}.png`),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(unexpected,[]);
  results.push({width,errors,writes,unexpected});await page.close();
 }
 await writeFile(path.join(artifacts,'result.json'),JSON.stringify({synthetic:true,results},null,2));
 console.log(JSON.stringify({synthetic:true,results}));
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
