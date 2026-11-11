// Real folio panel, isolated HTTP fixtures; no tenant, PAC or database connection.
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
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-numbering-ui-'));
const artifacts = path.resolve(process.env.NUMBERING_UI_SCREENSHOTS || 'artifacts/invoice-numbering');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {InvoiceNumberingPanel} from ${JSON.stringify(root + 'components/configuracion/invoice-numbering-panel.tsx')};
const app=createRoot(document.getElementById('root'));
window.renderSynthetic=(tenant='synthetic-a',available=true)=>app.render(<main className="mx-auto max-w-4xl p-4"><p className="mb-4 rounded bg-amber-100 p-3 text-sm">Ensayo sintético · sin conexión a cuentas reales</p><InvoiceNumberingPanel key={tenant} tenantId={tenant} tenantName={tenant==='synthetic-a'?'EMPRESA SINTÉTICA':'OTRA EMPRESA'} initial={{available,year:2026,policy:null}}/></main>);
window.renderSynthetic();`, loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic',
tsconfig: root + 'tsconfig.json', outfile: out + '/app.js', define: { 'process.env.NODE_ENV': '"production"' } });
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
const results = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const width of [1360, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId: 'America/Mexico_City' });
    const errors = [], requests = []; let fail = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()); assert.equal(url.origin, origin);
      if (!url.pathname.startsWith('/api/')) return route.continue();
      assert.equal(url.pathname, '/api/settings/invoice-numbering');
      assert.equal(request.method(), 'PUT'); assert.equal(request.headers()['x-tenant-context'], 'synthetic-a');
      const payload = request.postDataJSON(); requests.push(payload);
      assert.equal(payload.next_number, 125); assert.equal(payload.expected_revision, 0);
      if (fail) { fail = false; return route.fulfill({ status: 409, json: { error: 'La numeración cambió. Recarga antes de guardar' } }); }
      return route.fulfill({ json: { available: true, year: 2026, policy: { ...payload, revision: 1, series: 'FAC-2026', year: 2026, examples: ['FAC-2026-000125'] } } });
    });
    const capture = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Overflow ' + width + ' ' + name);
      await page.screenshot({ path: path.join(artifacts, 'numbering-' + width + '-' + name + '.png'), fullPage: true });
    };
    await page.goto(origin); await page.getByRole('heading', { name: 'Series y folios de facturas' }).waitFor();
    await page.getByText('FAC-2026-000001 · FAC-2026-000002 · FAC-2026-000003', { exact: true }).waitFor();
    assert.equal(requests.length, 0); await capture('default');
    await page.getByRole('checkbox', { name: 'Reiniciar en 1 cada año' }).check();
    await page.getByRole('checkbox', { name: 'Incluir año en la serie' }).uncheck();
    assert.equal(await page.getByRole('checkbox', { name: 'Reiniciar en 1 cada año' }).isChecked(), false);
    assert.equal(await page.getByRole('checkbox', { name: 'Reiniciar en 1 cada año' }).isDisabled(), true);
    await page.getByLabel('Serie o prefijo').fill('');
    await page.getByLabel('Próximo número').fill('125');
    await page.getByText('000125 · 000126 · 000127', { exact: true }).waitFor(); await capture('simple');
    await page.getByLabel('Serie o prefijo').fill('FAC');
    await page.getByRole('checkbox', { name: 'Incluir año en la serie' }).check();
    await page.getByRole('button', { name: 'Guardar numeración' }).click();
    await page.getByRole('alert').waitFor(); assert.equal(await page.getByRole('button', { name: 'Guardar numeración' }).count(), 0);
    await capture('conflict');
    await page.reload(); await page.getByLabel('Próximo número').fill('125');
    await page.getByRole('button', { name: 'Guardar numeración' }).click();
    await page.getByRole('status').filter({ hasText: 'Numeración guardada' }).waitFor(); await capture('saved');
    await page.evaluate(() => window.renderSynthetic('synthetic-b', false));
    await page.getByRole('status').filter({ hasText: 'pendiente de habilitación' }).waitFor();
    assert.equal(await page.locator('form').count(), 0); await capture('unavailable');
    assert.deepEqual(errors, []); assert.equal(requests.length, 2);
    results.push({ width, errors, requests }); await page.close();
  }
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ synthetic: true, results }, null, 2));
  console.log(JSON.stringify({ ok: true, synthetic: true, results }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
