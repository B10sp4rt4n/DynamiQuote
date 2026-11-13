// Real React panels, synthetic HTTP responses only. No operational data or emails.
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
const out = await mkdtemp(path.join(tmpdir(), 'cotiza-win-ui-'));
const artifacts = path.resolve(process.env.WIN_UI_SCREENSHOTS || 'artifacts/win-consolidation');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {WinConsolidationPanel} from ${JSON.stringify(root + 'components/propuestas/win-consolidation-panel.tsx')};
import {WinPolicyPanel} from ${JSON.stringify(root + 'components/configuracion/win-policy-panel.tsx')};
import {ExpiryAlertsBell} from ${JSON.stringify(root + 'components/layout/expiry-alerts-bell.tsx')};
const app=createRoot(document.getElementById('root'));
window.showPolicy=()=>app.render(<main className="mx-auto max-w-4xl p-4"><WinPolicyPanel initial={{revision:0,rules:[]}} tenantId="synthetic-a" tenantName="Empresa sintética" users={[]}/></main>);
window.showWin=()=>app.render(<main className="mx-auto max-w-4xl p-4"><WinConsolidationPanel proposalId="synthetic-proposal" tenantId="synthetic-a"/></main>);
window.showBell=()=>app.render(<main className="mx-auto max-w-4xl p-4"><div className="flex justify-end rounded-lg bg-white p-4"><ExpiryAlertsBell tenantId="synthetic-a"/></div></main>);
window.showPolicy();`, loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic', tsconfig: root + 'tsconfig.json', outfile: out + '/app.js',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'synthetic-next-navigation', setup(builder) {
    builder.onResolve({filter:/^next\/(navigation|link)$/}, args=>({path:args.path,namespace:'synthetic-next'}));
    builder.onLoad({filter:/.*/,namespace:'synthetic-next'}, args=>({contents:args.path.endsWith('navigation')?'export const useRouter=()=>({refresh(){}});':`import React from 'react';export default function Link(props){return React.createElement('a',props);}`,resolveDir:root}));
  }}] });
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
const results = []; let browser;
try {
  for (const width of [1360, 390]) {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.WIN_CHROMIUM_SINGLE_PROCESS ? ['--single-process','--no-zygote'] : [])] });
    const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId: 'America/Mexico_City' });
    const errors = [], writes = [];
    page.on('pageerror', e=>errors.push(e.message));
    let view, drop = false, approvalsResolved = false;
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()); assert.equal(url.origin, origin);
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (req.method() === 'GET' && url.pathname === '/api/proposals/expiring-alerts') return route.fulfill({json:{tenantId:'synthetic-a',alerts:[],unlabeled:[],approvalNotices:approvalsResolved?[]:[{key:'internal:synthetic-proposal',proposalId:'synthetic-proposal',proposalNumber:'PROP-SINTÉTICA',recipientCompany:'Cliente sintético',kind:'internal',requirements:['Autorización del owner'],href:'/propuestas?proposalId=synthetic-proposal'}]}});
      if (req.method() === 'GET') return route.fulfill({ json: view });
      assert.equal(req.headers()['x-tenant-context'],'synthetic-a');
      const body = req.postDataJSON(); writes.push(body);
      if (drop) { drop = false; return route.abort('failed'); }
      if (url.pathname === '/api/settings/win-policy') return route.fulfill({ json: { policy: {...body.policy,revision:1} } });
      assert.equal(url.pathname, '/api/proposals/synthetic-proposal/consolidation');
      if (body.action === 'decide') {
        assert.equal(body.expectedRevision,1); assert.equal(body.evidence,'Anticipo confirmado');
        view.case.revision++; view.case.decisions.finance={decision:'approved',actorId:'finance',actorRole:'admin',recordedAt:'2026-11-13T17:00:00Z',evidence:body.evidence};
        view.requirements[0].decision=view.case.decisions.finance;view.canConsolidate=true;
      } else { assert.equal(body.action,'consolidate'); assert.equal(body.expectedRevision,2); view.state='consolidated';view.canConsolidate=false;view.canCancel=false;view.case.consolidatedAt='2026-11-13T17:01:00Z';view.case.revision++;view.requirements[0].canDecide=false; }
      return route.fulfill({ json: view });
    });
    const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow '+width+' '+name);await page.screenshot({path:path.join(artifacts,`win-${width}-${name}.png`),fullPage:true});};
    await page.goto(origin);await page.getByRole('heading',{name:'Reglas para consolidar ganada'}).waitFor();await capture('minimum-policy');
    await page.getByRole('button',{name:'Agregar requisito'}).click();
    await page.getByLabel('Nombre del requisito').fill('Finanzas: anticipo');
    await page.getByLabel('owner',{exact:true}).uncheck();await page.getByLabel('admin',{exact:true}).check();
    await page.getByRole('button',{name:'Guardar reglas de ganada'}).click();await page.getByRole('status').filter({hasText:'Política guardada'}).waitFor();await capture('saved-policy');
    const rule={id:'finance',label:'Finanzas: anticipo',approverRoles:['admin'],approverUserIds:[],allowSelfApproval:false,evidenceRequired:true,allowWaiver:false,dependsOn:[],minimumAmount:null,currency:null};
    const pending=()=>({tenantId:'synthetic-a',proposalId:'synthetic-proposal',policy:{rules:[rule],revision:1},case:{revision:1,policyRevision:1,rules:[rule],fingerprint:'synthetic',acceptedOn:'2026-11-13',acceptedAt:'2026-11-13T16:00:00Z',acceptedBy:'seller',acceptanceEvidence:'Orden de compra del cliente',decisions:{},consolidatedAt:null,cancelledAt:null},state:'pending',canRecordAcceptance:false,canConsolidate:false,canCancel:true,people:{seller:'Vendedor sintético',finance:'Responsable de Finanzas'},requirements:[{...rule,decision:null,canDecide:true,canWaive:false,waitingFor:[]}]});
    view=pending();await page.evaluate(()=>window.showWin());await page.getByRole('status').filter({hasText:'pendiente de consolidación'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Consolidar ganada',exact:true}).count(),0);await capture('pending');
    await page.getByLabel('Evidencia o motivo: Finanzas: anticipo').fill('Anticipo confirmado');await page.getByRole('button',{name:'Dar OK',exact:true}).click();
    await page.getByRole('button',{name:'Consolidar ganada',exact:true}).waitFor();await capture('ready');
    await page.getByRole('button',{name:'Consolidar ganada',exact:true}).click();await page.getByRole('status').filter({hasText:'Ganada consolidada'}).waitFor();await capture('consolidated');
    view=pending();await page.getByRole('button',{name:'Recargar autorizaciones'}).click();await page.getByRole('status').filter({hasText:'pendiente de consolidación'}).waitFor();
    await page.getByLabel('Evidencia o motivo: Finanzas: anticipo').fill('Anticipo confirmado');drop=true;await page.getByRole('button',{name:'Dar OK',exact:true}).click();
    await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Dar OK',exact:true}).isDisabled(),true);await capture('uncertain');
    await page.evaluate(()=>window.showBell());await page.getByRole('button',{name:/Notificaciones: 1/}).waitFor();
    await page.getByRole('button',{name:/Notificaciones: 1/}).click();await page.getByText('Tu autorización interna está pendiente',{exact:true}).waitFor();await capture('approval-notification');
    approvalsResolved=true;await page.getByRole('button',{name:'Actualizar notificaciones'}).click();await page.getByText('No tienes aprobaciones pendientes.',{exact:true}).waitFor();await capture('approval-resolved');
    assert.equal(writes.length,4);assert.deepEqual(errors,[]);results.push({width,errors,mutations:writes.length});await browser.close();browser=null;
  }
  await writeFile(path.join(artifacts,'results.json'),JSON.stringify({synthetic:true,results},null,2));console.log(JSON.stringify({ok:true,results}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
