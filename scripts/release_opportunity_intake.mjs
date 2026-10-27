// Explicit, one-off release helper. It is never called by the normal build.
// Credentials come only from the existing deployment environment, never argv.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(new URL('../cotiza-web/package.json', import.meta.url));
const { Client } = require('pg');

const args = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=')));
const mode = args.mode;
if (!['check', 'apply', 'verify'].includes(mode) || !args['expected-host'] || !args.database) {
  throw new Error('Explicit --mode=check|apply|verify, --expected-host and --database are required');
}
let target;
try { target = new URL(process.env.DATABASE_URL ?? ''); }
catch { throw new Error('Missing or invalid DATABASE_URL; its contents are not logged'); }
if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Expected a PostgreSQL connection');
if (target.hostname !== args['expected-host'] || decodeURIComponent(target.pathname.slice(1)) !== args.database) {
  throw new Error(`Deployment database does not match the approved host/database (observed ${target.hostname}/${target.pathname.slice(1)})`);
}
// Direct connection for DDL; hostname/database remain the verified logical target.
const approvedHost = target.hostname;
target.hostname = target.hostname.replace('-pooler.', '.');
if (target.searchParams.has('sslmode')) target.searchParams.set('sslmode', 'verify-full');
const client = new Client({ connectionString: target.toString(), connectionTimeoutMillis: 15000, query_timeout: 60000 });
const migration = readFileSync(new URL('../cotiza-web/prisma/manual/20261027_opportunity_intake.sql', import.meta.url), 'utf8');
const statement = 'ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS intake_metadata jsonb;';
const normalized = migration.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
if (normalized !== `BEGIN; ${statement} COMMIT;`) throw new Error('Unexpected migration contents; stop for review');

async function fingerprint(table) {
  // Only fixed internal table identifiers are allowed, never input-derived SQL.
  if (!['public.opportunities', 'pg_temp.cotiza_intake_release_copy'].includes(table)) throw new Error('Unexpected fingerprint table');
  const result = await client.query(`SELECT count(*)::int AS rows,
    md5(COALESCE(string_agg((to_jsonb(o) - 'intake_metadata')::text, E'\\n' ORDER BY opportunity_id), '')) AS hash
    FROM ${table} o`);
  return result.rows[0];
}
function same(a, b) { return a.rows === b.rows && a.hash === b.hash; }
async function definition() {
  const result = await client.query("SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='intake_metadata'");
  return result.rows[0] ?? null;
}
let transaction = false;
try {
  await client.connect();
  const identity = (await client.query('SELECT current_database() AS database, version() AS version')).rows[0];
  if (identity.database !== args.database) throw new Error('Database identity mismatch');
  for (const table of ['public.tenants', 'public.quotes', 'public.opportunities', 'public.proposals']) {
    if (!(await client.query('SELECT to_regclass($1) AS table', [table])).rows[0].table) throw new Error('Cotiza schema was not found');
  }
  await client.query('BEGIN'); transaction = true;
  await client.query("SET LOCAL lock_timeout = '3s'");
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  // The production table is read only during the isolated-copy test.
  if (mode === 'apply') await client.query('LOCK TABLE public.opportunities IN ACCESS EXCLUSIVE MODE');
  const before = await fingerprint('public.opportunities');
  const oldDefinition = await definition();
  if (mode !== 'verify') {
    await client.query('CREATE TEMP TABLE cotiza_intake_release_copy (LIKE public.opportunities INCLUDING ALL) ON COMMIT DROP');
    await client.query('INSERT INTO pg_temp.cotiza_intake_release_copy SELECT * FROM public.opportunities');
    await client.query('ALTER TABLE pg_temp.cotiza_intake_release_copy ADD COLUMN IF NOT EXISTS intake_metadata jsonb');
    await client.query('ALTER TABLE pg_temp.cotiza_intake_release_copy ADD COLUMN IF NOT EXISTS intake_metadata jsonb');
    if (!same(before, await fingerprint('pg_temp.cotiza_intake_release_copy'))) throw new Error('Isolated-copy migration changed existing fields');
    console.log(JSON.stringify({ event: 'isolated_copy_pass', mode, database: identity.database, host: approvedHost, rows: before.rows, fingerprint: before.hash }));
  }
  if (mode === 'apply') await client.query(statement);
  const newDefinition = await definition();
  if (mode !== 'check' && (!newDefinition || newDefinition.data_type !== 'jsonb' || newDefinition.is_nullable !== 'YES')) {
    throw new Error('Expected nullable JSONB column was not found');
  }
  if (!same(before, await fingerprint('public.opportunities'))) throw new Error('Existing opportunity fields changed; rolling back');
  if (mode === 'apply' && !oldDefinition) {
    const populated = (await client.query('SELECT count(*)::int AS rows FROM public.opportunities WHERE intake_metadata IS NOT NULL')).rows[0].rows;
    if (populated !== 0) throw new Error('Unexpected historical backfill; rolling back');
  }
  await client.query(mode === 'apply' ? 'COMMIT' : 'ROLLBACK'); transaction = false;
  console.log(JSON.stringify({ event: mode === 'apply' ? 'migration_committed' : mode === 'verify' ? 'schema_verified' : 'check_rolled_back',
    host: approvedHost, database: identity.database, existingRows: before.rows, existingFieldsFingerprint: before.hash,
    columnExistedBefore: Boolean(oldDefinition), column: mode === 'check' ? oldDefinition : newDefinition }));
} catch (error) {
  if (transaction) await client.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ event: 'release_stopped', code: error.code ?? null,
    error: 'Database check or migration failed. No credentials or database contents are logged.' }));
  process.exitCode = 1;
} finally {
  await client.end();
}
