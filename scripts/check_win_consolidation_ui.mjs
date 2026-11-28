// Real React panels, synthetic HTTP responses only. No operational data or emails.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import {ProcurementDraftPanel} from ${JSON.stringify(root + 'components/compras/procurement-draft-panel.tsx')};
const app=createRoot(document.getElementById('root'));
window.showPolicy=()=>app.render(<main className="mx-auto max-w-4xl p-4"><WinPolicyPanel initial={{revision:0,rules:[]}} tenantId="synthetic-a" tenantName="Empresa sintética" users={[]}/></main>);
window.showWin=()=>app.render(<main className="mx-auto max-w-4xl p-4"><WinConsolidationPanel proposalId="synthetic-proposal" tenantId="synthetic-a"/></main>);
window.showBell=()=>app.render(<main className="mx-auto max-w-4xl p-4"><div className="flex justify-end rounded-lg bg-white p-4"><ExpiryAlertsBell tenantId="synthetic-a"/></div></main>);
window.showProcurement=()=>app.render(<main className="mx-auto max-w-4xl p-4"><ProcurementDraftPanel proposalId="synthetic-proposal" tenantId="synthetic-a"/></main>);
window.showPolicy();`, loader: 'tsx', resolveDir: root }, bundle: true, jsx: 'automatic', tsconfig: root + 'tsconfig.json', outfile: out + '/app.js',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'synthetic-next-navigation', setup(builder) {
    builder.onResolve({filter:/^next\/(navigation|link)$/}, args=>({path:args.path,namespace:'synthetic-next'}));
    builder.onLoad({filter:/.*/,namespace:'synthetic-next'}, args=>({contents:args.path.endsWith('navigation')?'export const useRouter=()=>({refresh(){}});':`import React from 'react';export default function Link(props){return React.createElement('a',props);}`,resolveDir:root}));
  }}] });
const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(await readFile(root + 'app/globals.css', 'utf8'), { from: root + 'app/globals.css' });
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
const emailSource=Buffer.from('From: Ana Cliente <cliente@example.test>\r\nDate: Fri, 27 Nov 2026 20:45:00 -0600\r\nSubject: Acepto PROP-SINTÉTICA\r\nMessage-ID: <reply@example.test>\r\nIn-Reply-To: <proposal@example.test>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nAdelante con la revisión 2.\r\n\r\nEl 27 nov 2026, Ventas escribió:\r\n> PROP-SINTÉTICA revisión 2 por 100 USD');
const emailPreview={acceptedOn:'2026-11-27',suggestedEvidence:'Adelante con la revisión 2.\n\n--- Contexto de la respuesta ---\nEl 27 nov 2026, Ventas escribió:\n> PROP-SINTÉTICA revisión 2 por 100 USD',
  email:{sha256:createHash('sha256').update(emailSource).digest('hex'),senderName:'Ana Cliente',senderEmail:'cliente@example.test',fromHeader:'Ana Cliente <cliente@example.test>',sentAt:'2026-11-28T02:45:00.000Z',dateHeader:'Fri, 27 Nov 2026 20:45:00 -0600',subject:'Acepto PROP-SINTÉTICA',messageId:'<reply@example.test>',inReplyTo:'<proposal@example.test>',replyText:'Adelante con la revisión 2.',quotedContext:'El 27 nov 2026, Ventas escribió:\n> PROP-SINTÉTICA revisión 2 por 100 USD',textTruncated:false,warnings:[]}};
try {
  for (const {width, colorScheme} of [1360, 390].flatMap(width => ['light', 'dark'].map(colorScheme => ({width, colorScheme})))) {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.WIN_CHROMIUM_SINGLE_PROCESS ? ['--single-process','--no-zygote'] : [])] });
    const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId: 'America/Mexico_City', locale: 'es-MX', colorScheme });
    const errors = [], writes = [];
    page.on('pageerror', e=>errors.push(e.message));
    let view, procurement, drop = false, purchaseDrop = false, approvalsResolved = false;
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()); assert.equal(url.origin, origin);
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname.endsWith('/consolidation/email-preview')) {
        const form=await new Response(req.postDataBuffer(),{headers:{'Content-Type':req.headers()['content-type']}}).formData();
        assert.equal(JSON.parse(form.get('data')).action,'preview-email');assert.equal(form.get('file').name,'confirmacion.eml');
        assert.equal(await form.get('file').text(),emailSource.toString('utf8'));
        return route.fulfill({json:{tenantId:'synthetic-a',proposalId:'synthetic-proposal',...emailPreview}});
      }
      if (req.method() === 'GET' && url.pathname === '/api/proposals/expiring-alerts') return route.fulfill({json:{tenantId:'synthetic-a',alerts:[],unlabeled:[],approvalNotices:approvalsResolved?[]:[{key:'internal:synthetic-proposal',proposalId:'synthetic-proposal',proposalNumber:'PROP-SINTÉTICA',recipientCompany:'Cliente sintético',kind:'internal',requirements:['Autorización del owner'],href:'/propuestas?proposalId=synthetic-proposal'}]}});
      if (url.pathname.endsWith('/procurement')) {
        if (req.method() === 'GET') return route.fulfill({json:procurement});
        assert.equal(req.headers()['x-tenant-context'],'synthetic-a');
        const body=req.postDataJSON();writes.push(body);
        if(body.action==='prepare') {
          assert.equal(body.expectedWinRevision,3);assert.equal(body.expectedFingerprint,'a'.repeat(64));
          procurement={...procurement,canPrepare:false,drafts:[purchaseDraft()]};
        } else {
          assert.equal(body.action,'update');assert.equal(body.expectedRevision,procurement.drafts[0].revision);
          procurement.drafts[0]={...procurement.drafts[0],notes:body.notes,neededOn:body.neededOn,revision:body.expectedRevision+1};
        }
        if(purchaseDrop){purchaseDrop=false;return route.abort('failed');}
        return route.fulfill({json:procurement});
      }
      if (req.method() === 'GET') return route.fulfill({ json: view });
      assert.equal(req.headers()['x-tenant-context'],'synthetic-a');
      let body, uploaded = null;
      if (req.headers()['content-type']?.startsWith('multipart/form-data')) {
        const form = await new Response(req.postDataBuffer(), { headers: { 'Content-Type': req.headers()['content-type'] } }).formData();
        body = JSON.parse(form.get('data')); uploaded = form.get('file');
        assert.equal(uploaded.name, 'confirmacion.eml'); assert.match(await uploaded.text(), /Acepto PROP-SINTÉTICA/);
      } else body = req.postDataJSON();
      writes.push(body);
      if (drop) { drop = false; return route.abort('failed'); }
      if (url.pathname === '/api/settings/win-policy') return route.fulfill({ json: { policy: {...body.policy,revision:1} } });
      assert.equal(url.pathname, '/api/proposals/synthetic-proposal/consolidation');
      if (body.action === 'accept') {
        assert.equal(body.confirmation.confirmedBy, 'Ana Cliente'); assert.equal(body.expectedRevision, view.case?.revision ?? 0);
        if(uploaded)assert.equal(body.confirmation.emailSourceHash,emailPreview.email.sha256);
        const pending = body.confirmation.channel === 'verbal';
        view = {...view, state:pending?'evidence_pending':'consolidated', canRecordAcceptance:pending, canCancel:pending,
          case:{revision:(view.case?.revision??0)+1,policyRevision:view.policy.revision,rules:[],fingerprint:'synthetic',
            acceptedOn:body.acceptedOn,acceptedAt:'2026-11-27T18:00:00Z',acceptedBy:'seller',acceptanceEvidence:body.evidence,
            customerEvidenceRequired:true, customerConfirmation:{channel:body.confirmation.channel,confirmedBy:body.confirmation.confirmedBy,contact:body.confirmation.contact,...(uploaded?{email:emailPreview.email,attachment:{id:'00000000-0000-4000-8000-000000000001',filename:uploaded.name,mimeType:'message/rfc822',sha256:emailPreview.email.sha256}}:{})},
            decisions:{},consolidatedAt:pending?null:'2026-11-27T18:00:00Z',cancelledAt:null}};
      } else if (body.action === 'decide') {
        assert.equal(body.expectedRevision,1); assert.equal(body.evidence,'Anticipo confirmado');
        view.case.revision++; view.case.decisions.finance={decision:'approved',actorId:'finance',actorRole:'admin',recordedAt:'2026-11-13T17:00:00Z',evidence:body.evidence};
        view.requirements[0].decision=view.case.decisions.finance;view.canConsolidate=true;
      } else { assert.equal(body.action,'consolidate'); assert.equal(body.expectedRevision,2); view.state='consolidated';view.canConsolidate=false;view.canCancel=false;view.case.consolidatedAt='2026-11-13T17:01:00Z';view.case.revision++;view.requirements[0].canDecide=false; }
      return route.fulfill({ json: view });
    });
    const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow '+width+' '+colorScheme+' '+name);await page.screenshot({path:path.join(artifacts,`win-${width}-${colorScheme}-${name}.png`),fullPage:true});};
    await page.goto(origin);await page.getByRole('heading',{name:'Reglas para consolidar ganada'}).waitFor();await capture('minimum-policy');
    await page.getByLabel(/Exigir respaldo escrito/).check();
    await page.getByLabel(/Preparar una requisición interna/).check();
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
    assert.equal(writes.length,4);assert.equal(writes[0].policy.procurementDraftsEnabled,true);assert.equal(writes[0].policy.customerEvidenceRequired,true);
    const unaccepted=()=>({tenantId:'synthetic-a',proposalId:'synthetic-proposal',policy:{rules:[],revision:1,customerEvidenceRequired:true},case:null,state:'not_accepted',canRecordAcceptance:true,canConsolidate:false,canCancel:false,requirements:[],
      document:{proposalNumber:'PROP-SINTÉTICA',quoteId:'q-synthetic',quoteName:'Renovación de licencias',quoteVersion:2,customer:'Cliente de prueba',amount:100,currency:'USD'}});
    view=unaccepted();await page.evaluate(()=>window.showWin());
    await page.getByRole('heading',{name:'¿Con qué evidencia cuentas para respaldar que el cliente aceptó esta propuesta?'}).waitFor();
    const contrast=await page.locator('section[aria-label="Consolidación de ganada"] form').evaluate(form=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
      const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
      const luminance=rgba=>rgba.slice(0,3).map(value=>{const c=value/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;}).reduce((sum,c,index)=>sum+c*[0.2126,0.7152,0.0722][index],0);
      const ratio=el=>{let parent=el,bg;while(parent){bg=rgb(getComputedStyle(parent).backgroundColor);if(bg[3]===255)break;parent=parent.parentElement;}const fg=luminance(rgb(getComputedStyle(el).color)),background=luminance(bg);return (Math.max(fg,background)+0.05)/(Math.min(fg,background)+0.05);};
      const labels=[...form.querySelectorAll('label')].map(el=>({label:el.firstChild.textContent.trim(),ratio:ratio(el)}));
      const button=[...form.querySelectorAll('button')].find(el=>el.textContent.trim()==='Adjuntar archivo de correo');
      return {labels,uploadButtonRatio:ratio(button),nativeControlScheme:getComputedStyle(form).colorScheme};
    });
    assert(contrast.labels.every(label=>label.ratio>=4.5),'Low label contrast '+JSON.stringify({colorScheme,contrast}));
    assert(contrast.uploadButtonRatio>=4.5,'Low upload button contrast');assert.equal(contrast.nativeControlScheme,'light');
    await page.getByRole('button',{name:'Adjuntar archivo de correo',exact:true}).waitFor();await capture('customer-attachment-form');
    await page.getByLabel('¿Quién confirmó por parte del cliente?').fill('Ana Cliente');
    await page.getByLabel('Medio de confirmación').selectOption('verbal');await capture('customer-verbal-form');
    await page.getByRole('button',{name:'Registrar aceptación del cliente',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Respaldo escrito pendiente'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Consolidar ganada',exact:true}).count(),0);await capture('customer-evidence-pending');
    await page.getByLabel('Medio de confirmación').selectOption('whatsapp');
    await page.getByLabel('Pega la confirmación o los mensajes relevantes').fill('Acepto PROP-SINTÉTICA, revisión 2, por 100 USD. Adelante con la renovación.');
    await page.getByRole('button',{name:'Completar respaldo del cliente',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Ganada consolidada'}).waitFor();await capture('customer-written-confirmation');
    view=unaccepted();await page.getByRole('button',{name:'Recargar autorizaciones'}).click();
    await page.getByLabel('Medio de confirmación').selectOption('email');
    await page.getByLabel('¿Quién confirmó por parte del cliente?').fill('');await page.getByLabel('Correo o teléfono del contacto (opcional)').fill('');
    await page.getByLabel('Fecha de aceptación del cliente').fill('2026-11-25');
    const fileChooser=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:'Adjuntar archivo de correo',exact:true}).click();
    await (await fileChooser).setFiles({name:'confirmacion.eml',mimeType:'message/rfc822',buffer:emailSource});
    await page.getByText('Datos leídos del correo adjunto',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('¿Quién confirmó por parte del cliente?').inputValue(),'Ana Cliente');
    assert.equal(await page.getByLabel('Correo o teléfono del contacto (opcional)').inputValue(),'cliente@example.test');
    assert.equal(await page.getByLabel('Fecha de aceptación del cliente').inputValue(),'2026-11-27');
    assert.match(await page.getByLabel('Pega la confirmación o los mensajes relevantes').inputValue(),/Contexto de la respuesta/);
    await page.getByText('Ver respuesta original y contexto del hilo',{exact:true}).click();
    await page.getByText('Archivo seleccionado: confirmacion.eml',{exact:true}).waitFor();await capture('customer-selected-email');
    await page.getByRole('button',{name:'Registrar aceptación del cliente',exact:true}).click();
    await page.getByRole('link',{name:'Descargar respaldo: confirmacion.eml'}).waitFor();await capture('customer-original-email');
    assert.equal(writes.length,7);
    const purchaseDraft=()=>({id:'00000000-0000-4000-8000-000000000001',tenantId:'synthetic-a',proposalId:'synthetic-proposal',folio:'REQ-2026-0001',closureKey:'b'.repeat(64),sourceHash:'c'.repeat(64),revision:1,state:'draft',reason:null,current:true,notes:'',neededOn:null,createdAt:'2026-11-16T16:00:00.000Z',createdBy:'seller',basis:{schemaVersion:1,tenantId:'synthetic-a',proposalId:'synthetic-proposal',proposalNumber:'PROP-SINTÉTICA',formalDocId:'formal-synthetic',quoteId:'quote-synthetic',opportunityId:null,customer:'Cliente de prueba',subject:'Licencias de prueba',currency:'USD',terms:'Condiciones aprobadas',fingerprint:'a'.repeat(64),winRevision:3,policyRevision:1,acceptedAt:'2026-11-16T15:00:00.000Z',consolidatedAt:'2026-11-16T16:00:00.000Z',acceptedBy:'seller',acceptanceEvidence:'Orden de compra de prueba',approvals:[{ruleId:'finance',label:'Finanzas',decision:'approved',actorId:'finance',actorRole:'admin',recordedAt:'2026-11-16T15:30:00.000Z',evidence:'Anticipo de prueba'}],items:[{itemId:'item-synthetic',itemNumber:1,sku:'LIC-TEST',description:'Licencias de prueba con descripción larga para comprobar la lectura en pantalla móvil',quantity:2,costUnit:10,subtotalCost:20,componentType:'product',origin:'vendor'}]}});
    procurement={tenantId:'synthetic-a',proposalId:'synthetic-proposal',enabled:true,canPrepare:false,reason:'Completa primero la consolidación de ganada y sus autorizaciones.',winRevision:1,fingerprint:'a'.repeat(64),drafts:[]};
    await page.evaluate(()=>window.showProcurement());await page.getByRole('status').filter({hasText:'Completa primero'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Preparar requisición en borrador',exact:true}).count(),0);await capture('purchase-pending');
    procurement={...procurement,canPrepare:true,reason:null,winRevision:3};
    await page.getByRole('button',{name:'Recuperar estado de la requisición'}).click();
    await page.getByRole('button',{name:'Preparar requisición en borrador',exact:true}).click();
    await page.getByRole('heading',{name:'REQ-2026-0001 · Borrador',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Preparar requisición en borrador',exact:true}).count(),0);
    await page.getByText('Origen y autorizaciones',{exact:true}).click();await page.getByText('Finanzas: OK · Anticipo de prueba',{exact:true}).waitFor();
    await page.getByLabel('Fecha requerida · REQ-2026-0001').fill('2026-11-30');
    await page.getByLabel('Observaciones para Compras · REQ-2026-0001').fill('Validar vigencia antes de comprar');
    await page.getByRole('button',{name:'Guardar preparación · REQ-2026-0001',exact:true}).click();await page.getByText('Revisión 2.',{exact:false}).waitFor();await capture('purchase-draft');
    await page.getByLabel('Observaciones para Compras · REQ-2026-0001').fill('Guardado de prueba con respuesta perdida');purchaseDrop=true;
    await page.getByRole('button',{name:'Guardar preparación · REQ-2026-0001',exact:true}).click();await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button',{name:'Guardar preparación · REQ-2026-0001',exact:true}).isDisabled(),true);await capture('purchase-uncertain');
    await page.getByRole('button',{name:'Recuperar estado de la requisición'}).click();await page.getByText('Revisión 3.',{exact:false}).waitFor();
    assert.equal(await page.getByLabel('Observaciones para Compras · REQ-2026-0001').inputValue(),'Guardado de prueba con respuesta perdida');
    assert.equal(await page.getByRole('button',{name:'Guardar preparación · REQ-2026-0001',exact:true}).isEnabled(),true);
    procurement.drafts[0]={...procurement.drafts[0],state:'review_required',current:false};
    await page.getByRole('button',{name:'Recuperar estado de la requisición'}).click();await page.getByRole('heading',{name:'REQ-2026-0001 · Requiere revisión',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Observaciones para Compras · REQ-2026-0001').isDisabled(),true);await capture('purchase-review-required');
    procurement={...procurement,tenantId:'synthetic-b'};await page.getByRole('button',{name:'Recuperar estado de la requisición'}).click();await page.getByRole('alert').filter({hasText:'empresa o propuesta activa cambió'}).waitFor();
    assert.equal(await page.getByRole('heading',{name:/REQ-2026-0001/}).count(),0);
    assert.equal(writes.length,10);assert.deepEqual(errors,[]);results.push({width,colorScheme,contrast,errors,mutations:writes.length});await browser.close();browser=null;
  }
  await writeFile(path.join(artifacts,'results.json'),JSON.stringify({synthetic:true,results},null,2));console.log(JSON.stringify({ok:true,results}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
