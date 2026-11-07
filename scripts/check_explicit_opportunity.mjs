// Runs only against a new local, disposable native PostgreSQL instance.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.EMBEDDED_POSTGRES_MODULE) throw Error('Set EMBEDDED_POSTGRES_MODULE to a temporary embedded-postgres install');
const { default: EmbeddedPostgres } = await import(process.env.EMBEDDED_POSTGRES_MODULE);
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = await mkdtemp(path.join(tmpdir(), 'cotiza-native-'));
const port = Number(process.env.COTIZA_NATIVE_PORT ?? 55482);
const pg = new EmbeddedPostgres({databaseDir:path.join(dir,'db'),user:'postgres',password:'synthetic-local-only',port,persistent:false,postgresFlags:["-c", "unix_socket_directories="],onLog:console.log,onError:console.error});
try {
 await pg.initialise();await pg.start();
 const client=pg.getPgClient();await client.connect();
 console.log((await client.query('select version()')).rows[0].version);
 const url=`postgresql://postgres:synthetic-local-only@127.0.0.1:${port}/postgres`;
 const result=spawnSync(process.execPath,[path.join(root,'cotiza-web/node_modules/prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema','prisma/schema.prisma','--script'],{cwd:path.join(root,'cotiza-web'),encoding:'utf8',env:{...process.env,DATABASE_URL:url}});
 if(result.status!==0)throw Error(result.stderr);
 await client.query(result.stdout);await client.query('ALTER TABLE proposal_approvals ADD COLUMN executed_by_user_id text');await client.end();
 const child=spawn(process.execPath,[path.join(root,'cotiza-web/node_modules/vitest/vitest.mjs'),'run','lib/db/explicit-opportunity.integration.test.ts','lib/db/opportunity-intake.integration.test.ts','--maxWorkers=1','--no-file-parallelism'],{cwd:path.join(root,'cotiza-web'),stdio:'inherit',env:{...process.env,DATABASE_URL:url,COTIZA_EXPLICIT_NATIVE:'1',COTIZA_INTAKE_INTEGRATION:'1'}});
 process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
 if ((process.env.COTIZA_BROWSER_CHECK === '1' || process.env.COTIZA_HTTP_CHECK === '1') && process.exitCode === 0) {
  const fixture=pg.getPgClient();await fixture.connect();
  await fixture.query("INSERT INTO tenants (tenant_id,name,slug,active,created_at) VALUES ('flow-demo','Empresa de prueba','flow-demo',true,now())");
  await fixture.query("INSERT INTO clients (client_id,tenant_id,company,active,created_at) VALUES ('11a244aa-5d21-4133-a073-7bac9e62c552','flow-demo','Cliente de prueba',true,now())");await fixture.end();
  const app=spawn(process.execPath,[createRequire(path.join(root,'cotiza-web/package.json')).resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3008'],{cwd:path.join(root,'cotiza-web'),stdio:'inherit',env:{...process.env,DATABASE_URL:url,DEFAULT_TENANT_SLUG:'flow-demo',NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'',CLERK_SECRET_KEY:'',NEXT_TELEMETRY_DISABLED:'1'}});
  if (process.env.COTIZA_HTTP_CHECK === '1') {
   try {
    let ready=false;for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:3008/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
    if(!ready)throw Error('Local Next server unavailable');
    const base='http://127.0.0.1:3008';
    const page=await fetch(base+'/oportunidades/nueva');const html=await page.text();
    if(!page.ok || !html.includes('Nombre del negocio') || !html.includes('Define el negocio'))throw Error('Declaration page not rendered');
    const input={creationId:crypto.randomUUID(),clientId:'11a244aa-5d21-4133-a073-7bac9e62c552',title:'HTTP synthetic renewal'};
    const post=()=>fetch(base+'/api/opportunities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const response=await post();const data=await response.json();if(response.status!==201)throw Error(JSON.stringify(data));
    const retry=await (await post()).json();if(retry.opportunity.opportunityId!==data.opportunity.opportunityId)throw Error('HTTP retry duplicated');
    const quote=await fetch(base+'/cotizaciones?opportunityId='+data.opportunity.opportunityId);const quoteHtml=await quote.text();if(!quote.ok || !quoteHtml.includes(input.title) || !quoteHtml.includes('Oportunidad existente'))throw Error('Quote prefill missing');
    console.log('HTTP: rendered declaration, created as session actor, recovered retry and prefilled existing opportunity successfully.');
   } finally {app.kill('SIGTERM');}
  } else await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);app.once('exit',resolve);});app.kill('SIGTERM');
 }
} finally {await pg.stop();}
