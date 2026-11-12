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
const artifacts = path.resolve(process.env.FISCAL_UI_SCREENSHOTS || 'artifacts/fiscal-classification');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProposalInvoicePanel} from ${JSON.stringify(root+'components/propuestas/proposal-invoice-panel.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-4"><h1 className="mb-3 text-lg font-bold">Ensayo sintético · Clasificación SAT</h1><p className="mb-4 text-sm">Sin validez fiscal · API simulada · no conectado al PAC</p><ProposalInvoicePanel canPrepareInvoice proposalId="synthetic" recipientCompany="EMPRESA SINTÉTICA"/></main>);`,
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
const catalog = { cfdiVersion: '4.0', source: 'SAT', sourceUrl: 'https://sat.gob.mx/', sourceFile: 'synthetic-fixture.xls',
  publishedAt: '2026-11-06', checkedAt: '2026-11-08', sourceSha256: 'b'.repeat(64), counts: { product: 52513, unit: 2418 } };
const product = { code: '43233205', description: 'Software de seguridad de transacciones y de protección contra virus', details: '', notes: '',
  valid: true, validFrom: '2022-01-01', validTo: null, domainRelations: ['threatdown → software, seguridad, proteccion'] };
const unit = { ...product, code: 'E48', description: 'Unidad de servicio', domainRelations: [] };
const classification = { itemNumber: 1, satProductCode: product.code, unitCode: unit.code,
  catalogVersion: catalog.sourceSha256, classificationEventId: 'fcl_'+'c'.repeat(64) };
const basis = { fingerprint: 'a'.repeat(64), currency: 'MXN', items: [{ itemNumber: 1, sku: 'SYNTHETIC-EDR', description: 'ThreatDown EDR licencia 12 meses' }] };
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const width of [1360, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], unexpected = [], counts = { confirm: 0, draft: 0, stamp: 0 };
    let drift = false, saved = false, preparation = null;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { unexpected.push(url.origin); await route.abort(); return; }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      let json;
      if (url.pathname.endsWith('/fiscal-classifications')) {
        if (request.method() === 'POST') {
          counts.confirm++;
          if (drift) return route.fulfill({ status: 409, json: { error: 'El catálogo cambió. Revisa y confirma otra vez la clasificación.' } });
          assert.deepEqual(request.postDataJSON(), { itemNumber: 1, expectedFingerprint: basis.fingerprint, nature: 'license',
            satProductCode: product.code, unitCode: unit.code, catalogVersion: catalog.sourceSha256, confirm: true, remember: true });
          saved = true; json = { classification };
        } else if (url.searchParams.get('mode') === 'resume') json = saved && !drift
          ? { saved: { classification, nature: 'license', remember: true }, validation: { valid: true, catalog, items: [{ itemNumber: 1, valid: true, product, unit }] } }
          : { saved: null };
        else if (url.searchParams.get('mode') === 'memory') json = { memory: null };
        else json = { catalog, results: [url.searchParams.get('kind') === 'product' ? product : unit] };
      } else if (url.pathname.endsWith('/invoice')) {
        if (request.method() === 'POST') { counts.draft++; assert.deepEqual(request.postDataJSON().fiscalItems, [classification]); preparation = { input: request.postDataJSON(), missingFields: [] }; json = { draft: { id: 'synthetic-draft', missingFields: [] } }; }
        else json = { ppdEnabled: true, cancellationEnabled: false, correctionsEnabled: false,
          invoice: { draftId: preparation ? 'synthetic-draft' : null, status: preparation ? 'draft' : null, uuid: null, stampedAt: null }, preparation, fiscalBasis: basis,
          clientFiscalData: { company: 'EMPRESA SINTÉTICA SIN VALIDEZ FISCAL', rfc: 'AAA010101AAA', fiscalRegime: '601', zipCode: '01000', cfdiUse: 'G03' } };
      } else { if (url.pathname.endsWith('/stamp')) counts.stamp++; unexpected.push(url.pathname); return route.fulfill({ status: 500, json: { error: 'Unexpected synthetic endpoint' } }); }
      return route.fulfill({ json });
    });
    const capture = async state => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${width}: ${state}`);
      await page.screenshot({ path: path.join(artifacts, `classification-${width}-${state}.png`), fullPage: true });
    };
    await page.goto(origin);
    await page.getByRole('button', { name: 'Generar prefactura', exact: true }).waitFor();
    await page.getByText('Siguiente paso: Selecciona qué estás facturando.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ir al siguiente paso', exact: true }).click();
    assert.equal(await page.getByLabel('¿Qué estás facturando?').evaluate(element => element === document.activeElement), true);
    await page.getByLabel('¿Qué estás facturando?').selectOption('license');
    assert.equal(await page.getByRole('button', { name: 'Generar prefactura', exact: true }).isEnabled(), false);
    await page.getByLabel('Producto o servicio SAT', { exact: true }).fill('ThreatDown EDR');
    await page.getByRole('button', { name: 'Buscar', exact: true }).nth(0).click();
    await page.getByRole('button').filter({ hasText: product.code }).waitFor();
    await capture('candidates');
    await page.getByRole('button').filter({ hasText: product.code }).click();
    await page.getByText('Siguiente paso: Busca y selecciona la Unidad SAT.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Confirmar clasificación', exact: true }).isEnabled(), false);
    await page.getByRole('button', { name: 'Ir al siguiente paso', exact: true }).click();
    assert.equal(await page.getByLabel('Unidad SAT', { exact: true }).evaluate(element => element === document.activeElement), true);
    await capture('unit-pending');
    await page.getByLabel('Unidad SAT', { exact: true }).fill('E48');
    await page.getByRole('button', { name: 'Buscar', exact: true }).nth(1).click();
    await page.getByRole('button').filter({ hasText: 'E48' }).click();
    assert.deepEqual(counts, { confirm: 0, draft: 0, stamp: 0 });
    assert.equal(await page.getByRole('button', { name: 'Confirmar clasificación', exact: true }).isEnabled(), false);
    await page.getByText('Siguiente paso: Marca la casilla de revisión de las dos claves.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ir al siguiente paso', exact: true }).click();
    assert.equal(await page.getByLabel('Revisé la descripción y las dos claves de esta partida.').evaluate(element => element === document.activeElement), true);
    await page.getByLabel('Revisé la descripción y las dos claves de esta partida.').check();
    await page.getByRole('button', { name: 'Confirmar clasificación', exact: true }).dblclick();
    await page.getByText('Claves vigentes y confirmadas para esta revisión.', { exact: true }).waitFor();
    assert.equal(counts.confirm, 1);
    await capture('confirmed');
    await page.getByRole('button', { name: 'Generar prefactura', exact: true }).dblclick();
    await page.getByRole('button', { name: 'Regenerar prefactura', exact: true }).waitFor();
    assert.equal(counts.draft, 1);
    await page.getByText('Prefactura preparada. Puedes revisar su vista previa.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Descargar PDF de prefactura', exact: true }).getAttribute('href'), '/api/proposals/synthetic/invoice/pdf?download=1');
    await capture('draft');
    await page.reload();
    await page.getByText('Claves vigentes y confirmadas para esta revisión.', { exact: true }).waitFor();
    await page.getByText('Prefactura preparada. Puedes revisar su vista previa.', { exact: true }).waitFor();
    assert.deepEqual(counts, { confirm: 1, draft: 1, stamp: 0 });
    await capture('reopened');
    assert.equal(await page.getByRole('button', { name: 'Timbrar (irreversible)', exact: true }).isEnabled(), true);
    await page.getByLabel('Producto o servicio SAT', { exact: true }).fill('Otra operación');
    assert.equal(await page.getByRole('link', { name: 'Descargar PDF de prefactura', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Regenerar prefactura', exact: true }).isEnabled(), false);
    assert.equal(await page.getByRole('button', { name: 'Timbrar (irreversible)', exact: true }).isEnabled(), false);
    await capture('edited');
    // A stale catalog response must remain an error, never a confirmation.
    drift = true;
    await page.getByRole('button', { name: 'Buscar', exact: true }).nth(0).click();
    await page.getByRole('button').filter({ hasText: product.code }).click();
    await page.getByLabel('Revisé la descripción y las dos claves de esta partida.').check();
    await page.getByRole('button', { name: 'Confirmar clasificación', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'El catálogo cambió' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Regenerar prefactura', exact: true }).isEnabled(), false);
    assert.equal(await page.getByRole('button', { name: 'Timbrar (irreversible)', exact: true }).isEnabled(), false);
    await capture('catalog-error');
    assert.equal(counts.stamp, 0); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({ width, passed: true, counts, consoleErrors: errors, externalRequests: unexpected, horizontalOverflow: false });
    await page.close();
  }
  await writeFile(path.join(artifacts, 'result.json'), JSON.stringify({ synthetic: true, results }, null, 2));
  console.log(JSON.stringify({ synthetic: true, results }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
