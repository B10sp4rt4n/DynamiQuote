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
const artifacts = path.resolve(process.env.FISCAL_UI_SCREENSHOTS || 'artifacts/sat-status');
await mkdir(artifacts, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProposalSatStatus} from ${JSON.stringify(root+'components/propuestas/proposal-sat-status.tsx')};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl p-4"><h1>Seguimiento SAT sintético</h1><ProposalSatStatus proposalId="synthetic" uuid="11111111-2222-4333-8444-555555555555"/></main>);`,
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
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],unexpected=[];let reads=0,queries=0;
  const uuid='11111111-2222-4333-8444-555555555555';
  const answer={id:'first',checked_at:'2026-11-10T18:00:00Z',source:'SAT ConsultaCFDIService',outcome:'answered',response:{Estado:'Vigente'},origin:'status_query'};
  const fail={id:'failed',checked_at:'2026-11-10T18:01:00Z',source:'SAT ConsultaCFDIService',outcome:'query_failed',response:null,error:'Consulta sin confirmar',origin:'status_query'};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(!url.pathname.endsWith('/sat-status') || url.searchParams.get('expected_uuid')!==uuid){unexpected.push(url.pathname);return route.abort();}
   if(req.method()==='POST')queries++;else reads++;
   return route.fulfill({json:{document_uuid:uuid,history:queries?[fail,answer]:[answer],last_answer:answer,latest_attempt:queries?fail:answer}});
  });
  await page.goto(origin);await page.getByText('Vigente',{exact:true}).waitFor();
  assert.equal(queries,0);
  await page.getByRole('button',{name:'Consultar estado en SAT',exact:true}).click();
  await page.getByText('Consulta fallida ·',{exact:false}).waitFor();
  await page.getByText('Vigente',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Actualizar historial sin consultar SAT',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(artifacts,`sat-${width}.png`),fullPage:true});
  assert.equal(queries,1);assert.equal(reads,2);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({width,queries,reads,errors,unexpected}));await page.close();
 }
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
