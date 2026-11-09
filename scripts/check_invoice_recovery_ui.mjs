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
const artifacts = path.resolve(process.env.FISCAL_UI_SCREENSHOTS || 'artifacts/invoice-recovery');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProposalInvoicePanel} from ${JSON.stringify(root+'components/propuestas/proposal-invoice-panel.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-4"><h1 className="mb-3 text-lg font-bold">Ensayo sintético · Recuperación de factura</h1><p className="mb-4 text-sm">Sin validez fiscal · API simulada · no conectado al PAC</p><ProposalInvoicePanel proposalId="synthetic" recipientCompany="EMPRESA SINTÉTICA"/></main>);`,
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
const uuid = '11111111-2222-4333-8444-555555555555';
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  for (const width of [1360,390]) {
    const page = await browser.newPage({ viewport:{width,height:900} });
    const errors = [], unexpected = [], counts = { query:0,recover:0,stamp:0 };
    let recovered = false;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.route('**/*',async route=>{
      const request=route.request(), url=new URL(request.url());
      if(url.origin!==origin) { unexpected.push(url.origin); return route.abort(); }
      if(!url.pathname.startsWith('/api/')) return route.continue();
      if(url.pathname.endsWith('/production-cancellation')) return route.fulfill({json:{enabled:false}});
      if(url.pathname.endsWith('/invoice')) return route.fulfill({json:{ppdEnabled:false,cancellationEnabled:false,correctionsEnabled:false,
        invoice:{draftId:'synthetic-draft',status:recovered?'stamped':'stamping',uuid:recovered?uuid:null,stampedAt:recovered?'2026-11-09T12:00:00Z':null}}});
      if(url.pathname.endsWith('/reconcile')) {
        const body = request.postDataJSON();
        if(!body) { counts.query++; return route.fulfill({status:409,json:{error:'Resultado todavía desconocido. No vuelvas a timbrar.'}}); }
        assert.deepEqual(body,{expectedDraftId:'synthetic-draft',invoiceUuid:uuid,confirm:true}); counts.recover++;
        if(counts.recover===1) return route.fulfill({status:502,json:{error:'Consulta sintética sin respuesta; el timbrado sigue protegido.'}});
        recovered=true; return route.fulfill({json:{status:'stamped',uuid}});
      }
      if(url.pathname.endsWith('/stamp')) counts.stamp++;
      unexpected.push(url.pathname); return route.fulfill({status:500,json:{error:'Unexpected synthetic route'}});
    });
    const capture=async name=>{
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow ${width} ${name}`);
      await page.screenshot({path:path.join(artifacts,`recovery-${width}-${name}.png`),fullPage:true});
    };
    await page.goto(origin);
    await page.getByText('Timbrado pendiente de confirmación',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Timbrar (irreversible)',exact:true}).count(),0);
    const recover=page.getByRole('button',{name:'Recuperar XML por UUID (sin timbrar)',exact:true});
    assert.equal(await recover.isEnabled(),false); await capture('unknown');
    await page.getByRole('button',{name:'Consultar estado (sin timbrar)',exact:true}).click();
    await page.getByText('Resultado todavía desconocido. No vuelvas a timbrar.',{exact:true}).waitFor();
    await page.getByLabel('UUID confirmado por el proveedor').fill('inventado'); assert.equal(await recover.isEnabled(),false);
    await page.getByLabel('UUID confirmado por el proveedor').fill(uuid); await recover.click();
    await page.getByText('Consulta sintética sin respuesta; el timbrado sigue protegido.',{exact:true}).waitFor(); await capture('retrieval-failed');
    await recover.click(); await page.getByText('Factura timbrada',{exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Descargar XML',exact:true}).getAttribute('href'),'/api/proposals/synthetic/invoice/xml');
    assert.equal(await page.getByRole('link',{name:'Descargar PDF',exact:true}).getAttribute('href'),'/api/proposals/synthetic/invoice/pdf');
    await capture('recovered'); await page.reload(); await page.getByText('Factura timbrada',{exact:true}).waitFor();
    assert.deepEqual(counts,{query:1,recover:2,stamp:0}); assert.deepEqual(errors,[]); assert.deepEqual(unexpected,[]);
    results.push({width,counts,errors,unexpected,reload:'stamped'}); await page.close();
  }
  await writeFile(path.join(artifacts,'result.json'),JSON.stringify({synthetic:true,results},null,2));
  console.log(JSON.stringify({synthetic:true,results}));
} finally { if(browser)await browser.close(); await new Promise(resolve=>server.close(resolve)); }
