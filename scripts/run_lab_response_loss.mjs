// Explicit opt-in only. Disposable Cotiza SQL + existing tenant-scoped QA Digestor.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),web=path.join(root,'cotiza-web');
const require=createRequire(path.join(web,'package.json'));
const scenario=process.env.COTIZA_LAB_RECOVERY_CASE??'invoice';
if(!['invoice','rep'].includes(scenario))throw Error('Unknown QA scenario');
const testFile=scenario==='rep'?'lib/integrations/receipt-response-loss.lab.test.ts':'lib/integrations/invoice-response-loss.lab.test.ts';
if(process.argv[2]!=='--execute-lab-sandbox')throw Error('Explicit --execute-lab-sandbox required');
const credentialsFile=process.env.COTIZA_LAB_CREDENTIALS_FILE;
const evidence=process.env.COTIZA_LAB_RECOVERY_EVIDENCE;
if(!credentialsFile||!evidence||!process.env.ESBUILD_MODULE)throw Error('Provide credentials file, new evidence directory and ESBUILD_MODULE');
if((await stat(credentialsFile)).mode&0o077)throw Error('Credentials file must be private');
const credentials=JSON.parse(await readFile(credentialsFile,'utf8'));
if(credentials.tenantId!=='90dbf915-de98-4ebb-b88c-f27b6e8c645a'||credentials.operatorUsername!=='cotiza_lab_connector'||!credentials.operatorPassword)throw Error('Unexpected QA identity');
await mkdir(evidence,{recursive:false,mode:0o700});
const {PGlite}=require('@electric-sql/pglite');
const {PGLiteSocketServer}=require('@electric-sql/pglite-socket');
let db,server,child;
try{
 db=await PGlite.create();
 const schema=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema','prisma/schema.prisma','--script'],{cwd:web,encoding:'utf8',env:{...process.env,DATABASE_URL:'postgresql://unused:unused@127.0.0.1:1/unused'}});
 if(schema.status!==0)throw Error('Cannot prepare disposable Cotiza schema');
 await db.exec(schema.stdout);
 // Existing operational column documented in prisma/manual/README.md.
 await db.exec('ALTER TABLE proposal_approvals ADD COLUMN IF NOT EXISTS executed_by_user_id text');
 server=new PGLiteSocketServer({db,host:'127.0.0.1',port:0,maxConnections:12});await server.start();
 const connection=`postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
 const env={...process.env,DATABASE_URL:connection,COTIZA_TEST_DATABASE_URL:connection,
  COTIZA_LAB_RECOVERY_ENABLED:'true',COTIZA_LAB_RECOVERY_EVIDENCE:path.resolve(evidence),
  DIGESTOR_FISCAL_BASE_URL:'',DIGESTOR_FISCAL_USERNAME:'',DIGESTOR_FISCAL_PASSWORD:'',DIGESTOR_FISCAL_TENANT_ID:'',
  DIGESTOR_FISCAL_SANDBOX_ENABLED:'true',DIGESTOR_FISCAL_SANDBOX_TENANT_ID:credentials.tenantId,
  DIGESTOR_FISCAL_SANDBOX_BASE_URL:'https://digestor-cotiza-lab-production.up.railway.app',
  DIGESTOR_FISCAL_SANDBOX_USERNAME:credentials.operatorUsername,DIGESTOR_FISCAL_SANDBOX_PASSWORD:credentials.operatorPassword,
  DIGESTOR_FISCAL_PPD_PRODUCTION_ENABLED:'true',DIGESTOR_FISCAL_PPD_ENABLED:scenario==='rep'?'true':'false',
  DIGESTOR_FISCAL_CANCELLATION_ENABLED:'false',DIGESTOR_FISCAL_CORRECTIONS_ENABLED:'false',
  DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED:'true'};
 child=spawn(process.execPath,[path.join(path.dirname(require.resolve('vitest')),'vitest.mjs'),'run',testFile,'--maxWorkers=1','--no-file-parallelism'],{cwd:web,env,stdio:scenario==='invoice'&&process.env.COTIZA_LAB_RECOVERY_AUTO==='true'?['ignore','pipe','inherit']:'inherit'});
 if(scenario==='invoice'&&process.env.COTIZA_LAB_RECOVERY_AUTO==='true'){
  let launched=false,buffer='';
  child.stdout.on('data',chunk=>{
   process.stdout.write(chunk);buffer+=chunk.toString();
   const found=buffer.match(/"qa_ui":"(http:\/\/127\.0\.0\.1:\d+)"/);
   if(!found||launched)return;launched=true;
   void drive(found[1]).catch(error=>{console.error('Isolated HTTP verification stopped:',error.message);child.kill();process.exitCode=1;});
  });
 }
 process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}finally{
 if(child&&child.exitCode===null)child.kill();
 if(server)await server.stop();if(db)await db.close();
}

async function drive(base){
 const calls=[];
 const call=async(endpoint,method='GET')=>{
  const r=await fetch(base+endpoint,{method,headers:{origin:base},signal:AbortSignal.timeout(70000)});
  const b=await r.json();calls.push({endpoint,method,status:r.status});return{response:r,body:b};
 };
 assert.equal((await call('/__state')).body.started,false);
 assert.equal((await call('/__start','POST')).response.status,200);
 const state=(await call('/__state')).body;
 const invoice='/api/proposals/'+state.proposal_id+'/invoice';
 assert.equal((await call(invoice)).body.invoice.status,'stamping');
 assert.equal((await call(invoice+'/reconcile','POST')).response.status,502);
 assert.equal((await call(invoice)).body.invoice.status,'stamping');
 const recovered=await call(invoice+'/reconcile','POST');
 assert.equal(recovered.response.status,200);assert.equal(recovered.body.uuid,state.invoice_uuid);
 for(let i=0;i<2;i++){
  const current=(await call(invoice)).body.invoice;
  assert.equal(current.status,'stamped');assert.equal(current.uuid,state.invoice_uuid);
 }
 for(const [suffix,name]of[['xml','recuperado.xml'],['pdf','recuperado.pdf']]){
  const r=await fetch(base+invoice+'/'+suffix,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);
  await writeFile(path.join(evidence,name),Buffer.from(await r.arrayBuffer()));
 }
 assert.deepEqual(await readFile(path.join(evidence,'recuperado.xml')),await readFile(path.join(evidence,'aceptacion-remota.xml')));
 assert.equal((await readFile(path.join(evidence,'recuperado.pdf'))).subarray(0,5).toString(),'%PDF-');
 await writeFile(path.join(evidence,'verificacion-http.json'),JSON.stringify({browser_tested:false,calls,same_uuid:true,same_xml_bytes:true,repeat_reads_preserved_state:true},null,2));
 assert.equal((await call('/__finish','POST')).response.status,200);
}
