// Starts only disposable loopback SQL and the separately checked-out synthetic Digestor fixture.
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), web = path.join(root, 'cotiza-web');
const digestor = process.env.DIGESTOR_FIXTURE_ROOT;
const python = process.env.DIGESTOR_FIXTURE_PYTHON;
if (!digestor || !python || !existsSync(path.join(digestor, 'scripts/run_fiscal_cycle_fixture.py'))) throw Error('Set DIGESTOR_FIXTURE_ROOT/PYTHON to the isolated Digestor checkout/venv');
function cli(pkg, file) {
  for (const base of [web, root]) { const candidate = path.join(base, 'node_modules', pkg, file); if (existsSync(candidate)) return candidate; }
  throw Error('Missing CLI '+pkg);
}
let db, server, backend;
try {
  let connection = process.env.COTIZA_TEST_DATABASE_URL;
  if (!connection) {
    const { PGlite } = await import(process.env.PGLITE_MODULE);
    const { PGLiteSocketServer } = await import(process.env.PGLITE_SOCKET_MODULE);
    db = await PGlite.create();
    const schema = spawnSync(process.execPath, [cli('prisma','build/index.js'), 'migrate','diff','--from-empty','--to-schema','prisma/schema.prisma','--script'],
      { cwd: web, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://test:test@127.0.0.1/unused' } });
    if (schema.status !== 0) throw Error(schema.stderr);
    await db.exec(schema.stdout);
    server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 12 }); await server.start();
    connection = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  }
  if (!['127.0.0.1','localhost','[::1]'].includes(new URL(connection).hostname)) throw Error('Disposable loopback SQL required');
  const probe = createServer(); await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  backend = spawn(python, [path.join(digestor, 'scripts/run_fiscal_cycle_fixture.py'), '--port',String(port)], { cwd: digestor, stdio: 'inherit' });
  let ready = false;
  const base = `http://127.0.0.1:${port}`;
  for (let i=0; i<100; i++) {
    if (backend.exitCode !== null) throw Error('Synthetic Digestor exited before readiness');
    try { if ((await (await fetch(base+'/__fixture')).json()).mode === 'synthetic-ppd-cycle-no-pac') { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  if (!ready) throw Error('Synthetic Digestor did not become ready');
  const test = spawn(process.execPath, [cli('vitest','vitest.mjs'),'run','lib/integrations/ppd-cycle.integration.test.ts','--maxWorkers=1','--no-file-parallelism'],
    { cwd: web, stdio:'inherit', env:{ ...process.env, DATABASE_URL:connection, COTIZA_TEST_DATABASE_URL:connection, FISCAL_PPD_FIXTURE_URL:base } });
  process.exitCode = await new Promise((resolve,reject) => { test.once('error',reject); test.once('exit',code=>resolve(code??1)); });
} finally {
  if (backend && backend.exitCode === null) { backend.kill(); await new Promise(resolve=>backend.once('exit',resolve)); }
  if (server) await server.stop();
  if (db) await db.close();
}
