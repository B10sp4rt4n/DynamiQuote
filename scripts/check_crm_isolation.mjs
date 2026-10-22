// Disposable local PostgreSQL exercise. Never connects to the application's DB.
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (!process.env.PGLITE_MODULE || !process.env.PGLITE_SOCKET_MODULE) {
  throw new Error('Set PGLITE_MODULE and PGLITE_SOCKET_MODULE to temporary installations. See docs/multitenant-foundation.md.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const web = path.join(root, 'cotiza-web');
const { PGlite } = await import(process.env.PGLITE_MODULE);
const { PGLiteSocketServer } = await import(process.env.PGLITE_SOCKET_MODULE);
const db = await PGlite.create();
let server;
try {
  const schema = spawnSync(process.execPath, [
    path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
    '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script',
  ], { cwd: web, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://test:test@127.0.0.1/unused' } });
  if (schema.status !== 0) throw new Error(schema.stderr || 'Cannot generate disposable schema');
  await db.exec(schema.stdout);
  // Operational column already used by the approval reader, documented in
  // prisma/manual/README.md, but missing from the current Prisma model.
  await db.exec('ALTER TABLE proposal_approvals ADD COLUMN executed_by_user_id text');
  for (const name of ['20261022_multitenant_foundation.sql', '20261022_multitenant_documents.sql']) {
    await db.exec(readFileSync(path.join(web, 'prisma/manual', name), 'utf8'));
  }
  server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 12 });
  await server.start();
  const connection = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  console.log('Disposable database ready on loopback; schema and multitenant constraints applied.');
  const child = spawn(process.execPath, [
    path.join(root, 'node_modules/vitest/vitest.mjs'), 'run',
    'lib/db/crm-isolation.integration.test.ts',
    'lib/db/opportunity-lifecycle.integration.test.ts',
    '--maxWorkers=1', '--no-file-parallelism',
  ], {
    cwd: web, stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: connection, COTIZA_TEST_DATABASE_URL: connection },
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
  process.exitCode = code;
} finally {
  if (server) await server.stop();
  await db.close();
}
