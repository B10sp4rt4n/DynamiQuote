// Disposable local PostgreSQL exercise. Never connects to the application's DB.
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (!process.env.PGLITE_MODULE || !process.env.PGLITE_SOCKET_MODULE) {
  throw new Error('Set PGLITE_MODULE and PGLITE_SOCKET_MODULE to temporary installations. See docs/multitenant-foundation.md.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const web = path.join(root, 'cotiza-web');
// npm workspaces may install CLI packages under cotiza-web/node_modules rather
// than the repository root. Resolve both layouts without changing dependencies.
function resolveCli(packageName, subpath) {
  for (const modules of [path.join(web, 'node_modules'), path.join(root, 'node_modules')]) {
    const candidate = path.join(modules, packageName, subpath);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot locate ${packageName}/${subpath} in the installed workspace`);
}
const { PGlite } = await import(process.env.PGLITE_MODULE);
const { PGLiteSocketServer } = await import(process.env.PGLITE_SOCKET_MODULE);
const db = await PGlite.create();
let server;
try {
  const schema = spawnSync(process.execPath, [
    resolveCli('prisma', 'build/index.js'), 'migrate', 'diff',
    '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script',
  ], { cwd: web, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://test:test@127.0.0.1/unused' } });
  if (schema.status !== 0) throw new Error(schema.stderr || 'Cannot generate disposable schema');
  await db.exec(schema.stdout);
  // Operational column already used by the approval reader, documented in
  // prisma/manual/README.md, but missing from the current Prisma model.
  await db.exec('ALTER TABLE proposal_approvals ADD COLUMN executed_by_user_id text');
  server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 12 });
  await server.start();
  const connection = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  console.log('Disposable database ready on loopback; production-compatible schema initialized.');
  const child = spawn(process.execPath, [
    resolveCli('vitest', 'vitest.mjs'), 'run',
    'lib/db/proposal-delivery.integration.test.ts',
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
