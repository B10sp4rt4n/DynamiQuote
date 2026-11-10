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
const artifacts = path.resolve(process.env.FISCAL_UI_SCREENSHOTS || 'artifacts/csf-read');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {CsfReviewPanel} from ${JSON.stringify(root+'components/clientes/csf-review-panel.tsx')};
const current={company:'',rfc:'',fiscalRegime:'',zipCode:'',address:''};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl p-4"><h1>CSF sintética · sin datos personales</h1><CsfReviewPanel current={current} onApply={()=>{}} onPendingChange={()=>{}}/></main>);`,
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
try {
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [1360,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],unexpected=[];let uploads=0,reads=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname!=='/api/clients/csf'){unexpected.push(url.pathname);return route.abort();}
   if(req.method()==='POST'){uploads++;return route.fulfill({json:{token:'synthetic',status:'queued'}});}
   reads++;
   return route.fulfill({json:reads<3?{status:reads===1?'queued':'processing'}:{status:'done',review:{revision:'a'.repeat(64),values:{company:'EMPRESA SINTETICA',rfc:'AAA010101AAA',fiscalRegime:'601',zipCode:'01234',address:'DOMICILIO SINTETICO'},issues:{},regimeText:'General',suggestions:[]}}});
  });
  await page.goto(origin);
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Cargar y leer CSF (PDF)',exact:true}).click();
  await (await chooser).setFiles({name:'csf-sintetica.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 synthetic browser fixture')});
  await page.getByText('Archivo recibido; esperando turno de lectura…',{exact:false}).waitFor();
  await page.getByText('Extrayendo datos fiscales;', {exact:false}).waitFor();
  await page.getByLabel('CSF: Razón social',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirmar y aplicar al formulario',exact:true}).isEnabled(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(artifacts,`csf-${width}.png`),fullPage:true});
  assert.equal(uploads,1);assert.equal(reads,3);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({width,uploads,reads,errors,unexpected}));await page.close();
 }
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
