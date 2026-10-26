// Real catalog queries in disposable PostgreSQL, no DATABASE_URL or credentials.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const root = fileURLToPath(new URL('../', import.meta.url));
const schemaAudit = readFileSync(new URL('./audit_crm_schema_requirements.sql', import.meta.url), 'utf8');
const prismaCli = [path.join(root, 'cotiza-web/node_modules/prisma/build/index.js'),
  path.join(root, 'node_modules/prisma/build/index.js')].find(existsSync);
assert.ok(prismaCli, 'Install locked dependencies before generating the fixture schema');
const schema = spawnSync(process.execPath, [prismaCli, 'migrate', 'diff', '--from-empty',
  '--to-schema', 'prisma/schema.prisma', '--script'], {
  cwd: path.join(root, 'cotiza-web'), encoding: 'utf8',
  env: { ...process.env, DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused' },
});
assert.equal(schema.status, 0, schema.stderr);
const db = new PGlite();
async function audit() {
  const results = await db.exec(schemaAudit);
  const result = results.flatMap(r => r.rows ?? []).find(r => r.crm_schema_readiness);
  assert.ok(result, 'Audit must return a metadata report');
  return result.crm_schema_readiness;
}
try {
  let report = await audit();
  assert.equal(report.missing_count, 16, 'Empty database must fail closed without relation errors');
  await db.exec(schema.stdout);
  report = await audit();
  assert.equal(report.missing_count, 1);
  assert.equal(report.wrong_type_count, 0);
  assert.ok(report.checks.some(c => c.table === 'proposal_approvals' && c.column === 'executed_by_user_id' && c.state === 'missing'));
  // Explicitly documented operational prerequisite not yet modeled in Prisma.
  await db.exec('ALTER TABLE proposal_approvals ADD COLUMN executed_by_user_id text');
  report = await audit();
  assert.equal(report.missing_count, 0);
  assert.equal(report.wrong_type_count, 0);
  await db.exec('ALTER TABLE proposal_approvals ALTER COLUMN executed_by_user_id TYPE integer USING NULL');
  report = await audit();
  assert.equal(report.wrong_type_count, 1, 'A present column with the wrong type must not pass');
  await db.exec('ALTER TABLE quotes DROP COLUMN input_metadata');
  report = await audit();
  assert.equal(report.missing_count, 1);
  assert.equal(report.wrong_type_count, 1);
  console.log('PASS: catalog-only audit detects empty schema, missing operational column, valid prerequisites, wrong type and removed metadata column.');
} finally { await db.close(); }
