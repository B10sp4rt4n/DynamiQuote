// Actual React panels; all API traffic is intercepted with synthetic fixtures.
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
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-correction-ui-'));
const artifacts = path.resolve(process.env.FISCAL_UI_SCREENSHOTS || 'artifacts/fiscal-correction');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProposalCorrectionPanel} from ${JSON.stringify(root+'components/propuestas/proposal-correction-panel.tsx')};
import {ProposalCancellationPanel} from ${JSON.stringify(root+'components/propuestas/proposal-cancellation-panel.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl p-4"><h1 className="text-lg font-bold">Ensayo sintético · Corrección fiscal</h1><p>Sin validez fiscal · API simulada · sin conexión al PAC</p><ProposalCorrectionPanel proposalId="synthetic"/><ProposalCancellationPanel proposalId="synthetic"/></main>);`,
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
  res.end(file ? await readFile(out+'/'+file) : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body style="background:#f4f4f5;font-family:Arial"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = '11111111-2222-4333-8444-555555555555', replacement = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const revision = 'bbbbbbbb-2222-4333-8444-555555555555';
let browser;
const results = [];
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH}:{}),
    headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  for (const width of [1360,390]) {
    const page = await browser.newPage({ viewport:{width,height:900} });
    const errors = [], unexpected = [], calls = {stamp:0,recover:0,cancelOriginal:0,confirm:0,cancel:0,query:0};
    let current = 'prepared', cancellation = 'not_requested', originalCancellation = 'not_requested';
    let failCorrectionRead = false, failCancellationRead = false;
    const value = () => ({environment:'production',kind:'invoice',active_uuid:originalCancellation==='cancelled'?replacement:source,
      pending:originalCancellation!=='cancelled',defaults:{customer_name:'EMPRESA SINTÉTICA'},history:[{
        id:revision,source_uuid:source,status:current,reason:'Corrección sintética revisada',changes:{customer_name:'EMPRESA CORREGIDA'},
        result_uuid:current==='stamped'?replacement:null,source_cancellation_status:originalCancellation}]});
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (req.method()==='POST') {
        const body = req.postDataJSON();
        if (url.pathname.endsWith('/correction/stamp')) {
          assert.deepEqual(body,{confirm_real_operation:true,revision_id:revision}); calls.stamp++;
          current='processing'; failCorrectionRead=true; return route.abort('failed');
        }
        if (url.pathname.endsWith('/correction/reconcile')) {
          assert.deepEqual(body,{receipt_uuid:replacement,revision_id:revision}); calls.recover++;current='stamped';
        } else if (url.pathname.endsWith('/correction/cancel-original')) {
          assert.deepEqual(body,{confirm_real_operation:true,revision_id:revision});calls.cancelOriginal++;originalCancellation='requested';
        } else if (url.pathname.endsWith('/correction/confirm-cancellation')) {
          assert.deepEqual(body,{revision_id:revision});calls.confirm++;originalCancellation='cancelled';
        } else if (url.pathname.endsWith('/cancellation')) {
          assert.equal(body.reason,'03');assert.equal(body.expected_uuid,source);assert.equal(body.confirm_real_operation,true);
          calls.cancel++;cancellation='requested';failCancellationRead=true;return route.abort('failed');
        } else if (url.pathname.endsWith('/cancellation/reconcile')) {
          calls.query++;cancellation='cancelled';
        } else {unexpected.push(url.pathname);return route.fulfill({status:500,json:{error:'Unexpected operation'}});}
      }
      if (url.pathname.endsWith('/correction') && failCorrectionRead) {
        failCorrectionRead=false;return route.fulfill({status:502,json:{error:'Consulta sintética sin respuesta'}});
      }
      if (url.pathname.includes('/correction')) return route.fulfill({json:value()});
      if (failCancellationRead) { failCancellationRead=false;return route.abort('failed'); }
      return route.fulfill({json:{environment:'production',status:cancellation,document_uuid:source,
        acknowledgement_xml:cancellation==='not_requested'?null:'<Acuse>Sintético</Acuse>'}});
    });
    const capture = async name => {
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow ${width} ${name}`);
      await page.screenshot({path:path.join(artifacts,`correction-${width}-${name}.png`),fullPage:true});
    };
    await page.goto(origin);
    const correction = page.locator('section').filter({has:page.getByRole('heading',{name:'Corregir y sustituir factura · comprobante real',exact:true})});
    const cancelPanel = page.locator('section').filter({has:page.getByRole('heading',{name:'Cancelación de factura · comprobante real',exact:true})});
    await correction.getByRole('checkbox').check();
    await correction.getByRole('button',{name:'Emitir sustituta real',exact:true}).dblclick();
    await correction.getByText('La operación no quedó confirmada en esta pantalla.',{exact:false}).waitFor();
    assert.equal(await correction.getByRole('button',{name:'Emitir sustituta real',exact:true}).isEnabled(),false);
    assert.equal(await correction.getByRole('button',{name:'Descartar corrección sin emitir',exact:true}).isEnabled(),false);
    await correction.getByRole('button',{name:'Consultar historial y estado'}).click();
    await correction.getByText('Consulta sintética sin respuesta',{exact:true}).waitFor();
    assert.equal(await correction.getByRole('button',{name:'Emitir sustituta real',exact:true}).isEnabled(),false);
    await capture('response-lost');
    await correction.getByRole('button',{name:'Consultar historial y estado'}).click();
    await correction.getByText('Emisión pendiente de confirmar',{exact:true}).waitFor();
    assert.equal(await correction.getByRole('button',{name:'Recuperar sustituta sin volver a timbrar'}).count(),0);
    current='unknown';await correction.getByRole('button',{name:'Consultar historial y estado'}).click();
    await correction.getByLabel('UUID confirmado por el proveedor').fill(replacement);
    await correction.getByRole('button',{name:'Recuperar sustituta sin volver a timbrar'}).click();
    await correction.getByText('Sustituta timbrada',{exact:true}).waitFor();
    await correction.getByRole('checkbox').check();
    await correction.getByRole('button',{name:'Solicitar cancelación real del anterior',exact:true}).click();
    assert.equal(await correction.getByText('Comprobante activo en Cotiza: '+source,{exact:true}).count(),1);
    await capture('awaiting-cancellation');
    await correction.getByRole('button',{name:'Consultar confirmación de cancelación'}).click();
    await correction.getByText('Comprobante activo en Cotiza: '+replacement,{exact:true}).waitFor();
    await cancelPanel.getByRole('checkbox').check();
    await cancelPanel.getByRole('button',{name:'Solicitar cancelación real',exact:true}).dblclick();
    await cancelPanel.getByText('Consulta la solicitud guardada antes de volver a solicitar una cancelación.',{exact:true}).waitFor();
    assert.equal(await cancelPanel.getByRole('button',{name:'Solicitar cancelación real',exact:true}).isEnabled(),false);
    await cancelPanel.getByRole('button',{name:'Consultar solicitud guardada'}).click();
    await cancelPanel.getByText('Cancelación solicitada; pendiente de confirmación',{exact:true}).waitFor();
    await cancelPanel.getByRole('link',{name:'Descargar acuse de solicitud'}).waitFor();
    assert.equal(await cancelPanel.getByText('Cancelación confirmada',{exact:true}).count(),0);
    await cancelPanel.getByRole('button',{name:'Consultar estado fiscal sin repetir solicitud'}).click();
    await cancelPanel.getByText('Cancelación confirmada',{exact:true}).waitFor();
    await capture('completed');
    assert.deepEqual(calls,{stamp:1,recover:1,cancelOriginal:1,confirm:1,cancel:1,query:1});
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    results.push({width,calls,errors,unexpected});await page.close();
  }
  await writeFile(path.join(artifacts,'result.json'),JSON.stringify({synthetic:true,results},null,2));
  console.log(JSON.stringify({synthetic:true,results}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
