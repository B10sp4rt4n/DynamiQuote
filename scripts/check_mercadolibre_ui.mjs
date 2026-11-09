// Actual inbox component, synthetic HTTP fixtures, no account or fiscal operations.
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
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-ml-ui-'));
const artifacts = path.resolve(process.env.ML_UI_SCREENSHOTS || 'artifacts/mercadolibre');
await mkdir(artifacts, { recursive: true });
const sale = { orderId: '2000000000000001', packId: '2000000000000002', sellerId: '123', buyerId: '456',
  status: 'paid', currency: 'MXN', total: '1160', createdAt: '2026-11-09T08:00:00-06:00', checkedAt: '2026-11-09T15:00:00Z',
  items: [{ itemId: 'MLM1', title: 'Producto sintético para verificar el detalle de una venta importada y su identificación por SKU',
    sku: 'SYNTHETIC-EXAMPLE-ONLY', quantity: 2, unitPrice: '580' }] };
const initial = { connection: { sellerId: '123', nickname: 'VENDEDOR_SINTETICO', status: 'connected', lastSyncAt: '2026-11-09T15:00:00Z' }, sales: [sale], total: 1 };
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {MercadoLibreInbox} from ${JSON.stringify(root + 'components/integraciones/mercadolibre-inbox.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-4"><p className="mb-4 rounded bg-amber-100 p-3 text-sm">Ensayo sintético · sin conexión a Mercado Libre</p><MercadoLibreInbox initial={${JSON.stringify(initial)}} ready={true} tenantName="EMPRESA SINTÉTICA"/></main>);`,
  loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic', tsconfig: root + 'tsconfig.json', outfile: out + '/app.js',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'isolated-next-link', setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'import React from "react";export default function Link(props){return <a {...props}/>}', loader: 'jsx', resolveDir: root }));
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
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let sync = 0, disconnected = false;
    const errors = [], unexpected = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname !== '/api/integrations/mercadolibre') { unexpected.push(url.pathname); return route.abort(); }
      if (request.method() === 'GET') return route.fulfill({ json: { ...initial,
        connection: { ...initial.connection, status: disconnected ? 'disconnected' : 'connected' },
        sales: [{ ...sale, status: sync > 1 ? 'cancelled' : 'paid' }] } });
      const input = request.postDataJSON();
      if (input.action === 'disconnect') { disconnected = true; return route.fulfill({ json: { disconnected: true } }); }
      assert.deepEqual(input, { action: 'sync', offset: 0 }); sync++;
      if (sync === 1) return route.fulfill({ status: 502, json: { error: 'Consulta sintética sin respuesta. Puedes consultar nuevamente.' } });
      return route.fulfill({ json: { inserted: 0, updated: 1, unchanged: 0, total: 1, nextOffset: null } });
    });
    const capture = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width} ${name}`);
      await page.screenshot({ path: path.join(artifacts, `mercadolibre-${width}-${name}.png`), fullPage: true });
    };
    await page.goto(origin); await page.getByRole('heading', { name: 'Ventas de Mercado Libre' }).waitFor();
    await page.getByText('Ver productos (1)', { exact: true }).click(); await capture('paid');
    const query = page.getByRole('button', { name: 'Consultar ventas recientes', exact: true });
    await query.click(); await page.getByRole('alert').waitFor(); assert.equal(sync, 1);
    await query.click(); await page.getByText('Cancelada', { exact: true }).waitFor(); assert.equal(sync, 2); await capture('cancelled');
    await page.getByRole('button', { name: 'Desconectar cuenta', exact: true }).click();
    assert.equal(disconnected, false); await page.getByRole('button', { name: 'Confirmar desconexión', exact: true }).click();
    await page.getByText('Sin conexión activa', { exact: true }).waitFor(); assert.equal(await query.isEnabled(), false);
    assert.equal(await page.getByRole('heading', { name: 'Orden 2000000000000001' }).count(), 1);
    await capture('disconnected'); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({ width, errors, unexpected, sync, disconnected }); await page.close();
  }
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ synthetic: true, results }, null, 2));
  console.log(JSON.stringify({ ok: true, synthetic: true, results }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
