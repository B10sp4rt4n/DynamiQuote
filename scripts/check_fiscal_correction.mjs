// Starts an in-memory, loopback-only Digestor. No PAC or production credentials.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('../cotiza-web/', import.meta.url));
const backendRoot = process.env.DIGESTOR_FIXTURE_ROOT;
const python = process.env.DIGESTOR_FIXTURE_PYTHON;
if (!backendRoot || !python || !existsSync(path.join(backendRoot, 'scripts/run_fiscal_cycle_fixture.py'))) {
  throw Error('Set DIGESTOR_FIXTURE_ROOT/PYTHON to the isolated Digestor checkout/venv');
}
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const backend = spawn(python, [path.join(backendRoot, 'scripts/run_fiscal_cycle_fixture.py'), '--port', String(port)], {
  cwd: backendRoot, stdio: 'inherit',
});
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (backend.exitCode !== null) throw Error('Synthetic Digestor exited before readiness');
    try { ready = (await (await fetch(base + '/__fixture')).json()).synthetic === true; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw Error('Synthetic Digestor did not become ready');
  const test = spawn(process.execPath, [path.join(web, 'node_modules/vitest/vitest.mjs'), 'run',
    'lib/integrations/fiscal-correction.integration.test.ts', '--maxWorkers=1', '--no-file-parallelism'], {
    cwd: web, stdio: 'inherit', env: { ...process.env, FISCAL_CORRECTION_FIXTURE_URL: base },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    test.once('error', reject); test.once('exit', code => resolve(code ?? 1));
  });
} finally {
  if (backend.exitCode === null) {
    backend.kill(); await new Promise(resolve => backend.once('exit', resolve));
  }
}
