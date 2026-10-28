// Synthetic data only. Builds an in-memory schema; never reads DATABASE_URL.
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (!process.env.PGLITE_MODULE || !process.env.PGLITE_SOCKET_MODULE) {
  throw Error('Set PGLITE_MODULE and PGLITE_SOCKET_MODULE to temporary installations. See docs/crm-workspace-pilot.md.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const web = path.join(root, 'cotiza-web');
function cli(name, subpath) {
  for (const modules of [path.join(web, 'node_modules'), path.join(root, 'node_modules')]) {
    const candidate = path.join(modules, name, subpath);
    if (existsSync(candidate)) return candidate;
  }
  throw Error(`Cannot find ${name}/${subpath}`);
}
const { PGlite } = await import(process.env.PGLITE_MODULE);
const { PGLiteSocketServer } = await import(process.env.PGLITE_SOCKET_MODULE);
const db = await PGlite.create();
let server;
try {
  const schema = spawnSync(process.execPath, [cli('prisma', 'build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], {
    cwd: web, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://test:test@127.0.0.1/unused' },
  });
  if (schema.status !== 0) throw Error(schema.stderr || 'Cannot generate schema');
  await db.exec(schema.stdout);
  await db.exec('ALTER TABLE proposal_approvals ADD COLUMN executed_by_user_id text');
  server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 12 });
  await server.start();
  const connection = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  const child = spawn(process.execPath, [cli('vitest', 'vitest.mjs'), 'run',
    'lib/db/crm-workspace.integration.test.tsx', 'lib/db/opportunity-intake.integration.test.ts', 'lib/db/quote-options.integration.test.ts',
    '--maxWorkers=1', '--no-file-parallelism'], {
    cwd: web, stdio: 'inherit', env: { ...process.env, DATABASE_URL: connection,
      COTIZA_CRM_INTEGRATION: '1', COTIZA_INTAKE_INTEGRATION: '1', COTIZA_OPTIONS_INTEGRATION: '1' },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
} finally {
  if (server) await server.stop();
  await db.close();
}
