// Loopback-only HTTP rehearsal. No usable database, Clerk or email credentials.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const results = [];
for (const mode of ['paused', 'off']) {
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: path.join(root, 'cotiza-web'), detached: true,
    env: { ...process.env, CRM_MAINTENANCE_MODE: mode,
      CLERK_SECRET_KEY: '', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
      ALLOW_BOOTSTRAP_AUTH: 'false', ALLOW_DEV_COOKIE_AUTH: 'false',
      DATABASE_URL: 'postgresql://qa:qa@127.0.0.1:9/unused',
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
  try {
    const ready = Date.now() + 30000;
    while (!output.includes('Ready in')) {
      if (child.exitCode !== null || Date.now() > ready) throw new Error(`Server not ready: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const cases = mode === 'paused' ? [
      ['GET', '/clientes/qa'], ['HEAD', '/propuestas/qa/pdf'],
      ['GET', '/api/settings/test-email'], ['POST', '/api/webhooks/clerk'],
      ['POST', '/api/quotes'], ['PUT', '/api/proposals/qa'],
      ['PATCH', '/api/settings/users/qa'], ['DELETE', '/api/quotes/qa'],
      ['POST', '/clientes/qa'], ['GET', '/api/exports/report.xlsx'],
      ['GET', '/clientes/report.csv'],
    ] : [['POST', '/api/quotes'], ['GET', '/api/webhooks/clerk']];
    for (const [method, route] of cases) {
      const response = await fetch(origin + route, { method, redirect: 'manual', signal: AbortSignal.timeout(45000) });
      const body = await response.text();
      assert.equal(response.status, mode === 'paused' ? 503 : method === 'POST' ? 401 : 200, `${mode} ${method} ${route}: ${body}`);
      if (mode === 'paused') {
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assert.equal(response.headers.get('Retry-After'), '300');
        if (method !== 'HEAD') assert.equal(JSON.parse(body).code, 'CRM_MAINTENANCE');
      }
      results.push({ mode, method, route, status: response.status });
    }
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    const exited = once(child, 'exit');
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (child.exitCode === null && child.signalCode === null) await exited;
  }
}
console.log(JSON.stringify({ target: 'loopback-only', database: 'unreachable placeholder', clerk: 'disabled', results }, null, 2));
