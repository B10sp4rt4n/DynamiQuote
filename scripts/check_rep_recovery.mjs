// Actual route handlers, HTTP/JWT and disposable PostgreSQL; no PAC credentials.
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),web=path.join(root,'cotiza-web');
const digestor=process.env.DIGESTOR_FIXTURE_ROOT,python=process.env.DIGESTOR_FIXTURE_PYTHON;
const database=process.env.COTIZA_TEST_DATABASE_URL,backendDatabase=process.env.REP_FIXTURE_DATABASE_URL;
if(!digestor||!python||!existsSync(path.join(digestor,'scripts/run_rep_recovery_fixture.py')))throw Error('Isolated Digestor checkout and Python required');
for(const [value,name] of [[database,'cotiza_synthetic'],[backendDatabase,'digestor_fiscal_test']]){
 if(!value)throw Error('Named disposable PostgreSQL databases required');
 const url=new URL(value);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.pathname!=='/'+name||!['postgresql:','postgresql+psycopg:'].includes(url.protocol))throw Error('Only named disposable loopback SQL allowed');
}
let backend;
try{
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
 const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const base='http://127.0.0.1:'+port;
 backend=spawn(python,[path.join(digestor,'scripts/run_rep_recovery_fixture.py'),'--port',String(port)],{cwd:digestor,stdio:'inherit'});
 let ready=false;
 for(let i=0;i<150;i++){
  if(backend.exitCode!==null)throw Error('Synthetic REP fixture exited before readiness');
  try{if((await(await fetch(base+'/__fixture')).json()).mode==='synthetic-postgres-rep-no-pac'){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error('Synthetic REP fixture did not become ready');
 const test=spawn(process.execPath,[path.join(web,'node_modules/vitest/vitest.mjs'),'run','lib/integrations/rep-recovery.integration.test.ts','--maxWorkers=1','--no-file-parallelism'],
  {cwd:web,stdio:'inherit',env:{...process.env,DATABASE_URL:database,REP_RECOVERY_FIXTURE_URL:base}});
 process.exitCode=await new Promise((resolve,reject)=>{test.once('error',reject);test.once('exit',code=>resolve(code??1));});
}finally{
 if(backend&&backend.exitCode===null){
  const done=new Promise(resolve=>backend.once('exit',resolve));backend.kill();
  const timer=setTimeout(()=>backend.kill('SIGKILL'),5000);await done;clearTimeout(timer);
 }
}
