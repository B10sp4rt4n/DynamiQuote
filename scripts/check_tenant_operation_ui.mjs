// Actual configuration components, synthetic HTTP only; never connects a tenant or provider.
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
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-operation-ui-'));
const artifacts = path.resolve(process.env.OPERATION_UI_SCREENSHOTS || 'artifacts/tenant-operation');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {TenantOperationPanel} from ${JSON.stringify(root + 'components/configuracion/tenant-operation-panel.tsx')};
const initial={tenantId:'synthetic-a',tenantName:'EMPRESA SINTÉTICA',initialMode:'consultative',canConfigure:true,mercadoLibreEntitled:false,mercadoLibreAvailable:false};
let props={...initial};const app=createRoot(document.getElementById('root'));
window.renderSynthetic=changes=>{props={...props,...changes};app.render(<main className="mx-auto max-w-5xl p-4"><p className="mb-4 rounded bg-amber-100 p-3 text-sm">Ensayo sintético · sin conexión a cuentas reales</p><TenantOperationPanel key={props.tenantId} {...props}/></main>)};
window.renderSynthetic({});`, loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic',
  tsconfig: root + 'tsconfig.json', outfile: out + '/app.js', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-next', setup(build) {
    build.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      contents: args.path === 'next/link' ? 'import React from "react";export default function Link(props){return <a {...props}/>}'
        : 'export function useRouter(){return {refresh(){window.dispatchEvent(new Event("synthetic-refresh"))}}}',
      loader: 'jsx', resolveDir: root,
    }));
  } }] });
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
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [], requests = []; let fail = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      assert.equal(url.origin, origin);
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const payload = request.postDataJSON();
      assert.equal(request.headers()['x-tenant-context'], 'synthetic-a');
      requests.push({ path: url.pathname, payload });
      if (url.pathname === '/api/settings/tenant-operation') {
        assert.deepEqual(payload, { mode: 'mixed' });
        if (fail) { fail = false; return route.fulfill({ status: 409, json: { error: 'La empresa activa cambió. Recarga la configuración.' } }); }
        return route.fulfill({ json: { mode: payload.mode } });
      }
      assert.equal(url.pathname, '/api/settings/tenant-capabilities');
      assert.deepEqual(payload, { capabilityKey: 'mercadolibre_channel', enabled: true });
      return route.fulfill({ json: { enabled: true } });
    });
    const capture = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow ${width} ${name}`);
      await page.screenshot({ path: path.join(artifacts, `operation-${width}-${name}.png`), fullPage: true });
    };
    await page.goto(origin); await page.getByRole('radio', { name: /^Venta consultiva/ }).waitFor(); await capture('default');
    await page.getByRole('radio', { name: /Mixta/ }).check();
    assert.equal(await page.getByRole('checkbox', { name: 'Canal Mercado Libre' }).isChecked(), false);
    await page.getByRole('button', { name: 'Guardar modalidad' }).click(); await page.getByRole('alert').waitFor();
    await page.getByRole('button', { name: 'Guardar modalidad' }).click();
    await page.getByText('Modalidad Mixta guardada para EMPRESA SINTÉTICA.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox').isChecked(), false); await capture('mode-saved');
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Guardar capacidades' }).click();
    await page.getByText('Canal Mercado Libre: habilitado para EMPRESA SINTÉTICA.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('radio', { name: /Mixta/ }).isChecked(), true);
    await page.evaluate(() => window.renderSynthetic({ tenantId: 'synthetic-b', tenantName: 'OTRA EMPRESA', canConfigure: false, mercadoLibreEntitled: false, mercadoLibreAvailable: false }));
    await page.getByRole('heading', { name: 'Modalidad de operación de OTRA EMPRESA' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: /^Venta consultiva/ }).isChecked(), true);
    assert.equal(await page.getByRole('radio', { name: /Mixta/ }).isDisabled(), true);
    assert.equal(await page.getByText('Canal Mercado Libre', { exact: true }).count(), 0); await capture('unentitled');
    await page.evaluate(() => window.renderSynthetic({ tenantId: 'synthetic-c', mercadoLibreEntitled: true, mercadoLibreAvailable: true }));
    await page.getByRole('link', { name: /Conectar cuenta/ }).waitFor(); await capture('enabled-channel');
    assert.deepEqual(errors, []); results.push({ width, errors, requests }); await page.close();
  }
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ synthetic: true, results }, null, 2));
  console.log(JSON.stringify({ ok: true, synthetic: true, results }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
