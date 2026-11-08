/** Offline browser acceptance of the actual React payment/cancellation panels.
 * PLAYWRIGHT_MODULE points to an existing Playwright installation; no PAC/Clerk access.
 */
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../cotiza-web/package.json', import.meta.url));
const { build } = require(process.env.ESBUILD_MODULE || 'esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');

const root = path.resolve(new URL('../cotiza-web', import.meta.url).pathname);
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-fiscal-ui-'));
const source = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProposalPaymentPanel} from ${JSON.stringify(root+'/components/propuestas/proposal-payment-panel.tsx')};
import {ProposalCancellationPanel} from ${JSON.stringify(root+'/components/propuestas/proposal-cancellation-panel.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-3xl p-4"><h1 className="text-xl font-bold">Prueba aislada · Facturación Cotiza</h1><ProposalPaymentPanel proposalId="synthetic" cancellationEnabled/><ProposalCancellationPanel proposalId="synthetic"/></main>);`;
await build({ stdin: { contents: source, loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic', outfile: out+'/app.js', define: { 'process.env.NODE_ENV': '"production"' } });
const css = await postcss([tailwind({ base: root })]).process('@import "tailwindcss";', { from: root+'/app/globals.css' });
await writeFile(out+'/app.css', css.css);
let servedRecovered = false, servedCancelState = 'not_requested';
const servedCalls = { recoveries: 0, cancels: 0, queries: 0 };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/api/') || pathname === '/__fixture') {
    res.setHeader('Content-Type', 'application/json');
    let value;
    if (pathname === '/__fixture') value = { synthetic: true, ...servedCalls };
    else if (pathname.endsWith('/payments')) value = { supported: true, total: '116.00', paid: '116.00', balance: '0.00', payments: [
      { id: 'first', sequence: 1, reference: 'SYNTHETIC-01', amount: '58.00', balance_after: '58.00', receipt_status: 'stamped', receipt_uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
      { id: 'second', sequence: 2, reference: 'SYNTHETIC-02', amount: '58.00', balance_after: '0.00', receipt_status: servedRecovered ? 'stamped' : 'unknown', receipt_uuid: servedRecovered ? 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' : null },
    ] };
    else if (pathname.endsWith('/receipt/reconcile')) { servedRecovered = true; servedCalls.recoveries++; value = { receipt_status: 'stamped' }; }
    else if (pathname.endsWith('/cancellation/reconcile')) { servedCancelState = 'cancelled'; servedCalls.queries++; value = { status: servedCancelState }; }
    else if (pathname.endsWith('/cancellation')) {
      if (req.method === 'POST') { servedCancelState = 'requested'; servedCalls.cancels++; }
      value = { status: pathname.includes('/second/') ? servedCancelState : 'not_requested' };
    } else { res.statusCode = 404; value = { error: 'Unknown fixture route' }; }
    res.end(JSON.stringify(value)); return;
  }
  const file = req.url === '/app.js' ? 'app.js' : req.url === '/app.css' ? 'app.css' : null;
  res.setHeader('Content-Type', file?.endsWith('.js') ? 'text/javascript' : file ? 'text/css' : 'text/html');
  res.end(file ? await readFile(out+'/'+file) : '<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
if (process.env.FISCAL_UI_SERVE_ONLY === 'true') {
  console.log('FISCAL_UI_URL=http://127.0.0.1:'+server.address().port);
  await new Promise(() => {});
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let recovered = false, cancelState = 'not_requested', cancels = 0, recoveries = 0;
  const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/payments')) return route.fulfill({ json: { supported: true, total: '116.00', paid: '116.00', balance: '0.00', payments: [
      { id: 'first', sequence: 1, reference: 'SYNTHETIC-01', amount: '58.00', balance_after: '58.00', receipt_status: 'stamped', receipt_uuid: uuid },
      { id: 'second', sequence: 2, reference: 'SYNTHETIC-02', amount: '58.00', balance_after: '0.00', receipt_status: recovered ? 'stamped' : 'unknown', receipt_uuid: recovered ? uuid : null },
    ] } });
    if (pathname.endsWith('/receipt/reconcile')) { recovered = true; recoveries++; return route.fulfill({ json: { receipt_status: 'stamped' } }); }
    if (pathname.endsWith('/cancellation/reconcile')) { cancelState = 'cancelled'; return route.fulfill({ json: { status: cancelState } }); }
    if (pathname.endsWith('/cancellation')) {
      if (request.method() === 'POST') { cancels++; cancelState = 'requested'; }
      return route.fulfill({ json: { status: pathname.includes('/second/') ? cancelState : 'not_requested' } });
    }
    return route.fulfill({ json: { error: 'Unexpected fixture request' }, status: 400 });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel('UUID del complemento confirmado por el proveedor').fill(uuid);
  await page.getByRole('button', { name: 'Recuperar XML sin volver a timbrar' }).click();
  await page.getByRole('link', { name: 'Descargar PDF' }).nth(1).waitFor();
  const second = page.locator('li').nth(1);
  await second.getByRole('checkbox').check();
  await second.getByRole('button', { name: 'Solicitar cancelación en pruebas' }).dblclick();
  await second.getByRole('button', { name: 'Consultar estado fiscal sin repetir solicitud' }).click();
  await second.getByRole('status').filter({ hasText: 'Cancelación confirmada' }).waitFor();
  if (recoveries !== 1 || cancels !== 1 || errors.length) throw new Error(JSON.stringify({ recoveries, cancels, errors }));
  for (const width of [390, 1360]) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal page overflow at '+width);
    if (process.env.FISCAL_UI_SCREENSHOTS) await page.screenshot({ path: process.env.FISCAL_UI_SCREENSHOTS+`/fiscal-${width}.png`, fullPage: true });
  }
  console.log(JSON.stringify({ passed: true, widths: [390,1360], recoveries, cancels, errors, mode: 'synthetic-ui-HTTP-fixtures' }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
