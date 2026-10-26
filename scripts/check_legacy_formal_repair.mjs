// Local-only exercise: never reads DATABASE_URL or contacts Neon.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to a temporary PGlite installation');
const { PGlite } = await import(process.env.PGLITE_MODULE);
const evidence = JSON.parse(readFileSync(new URL('../docs/evidence/multitenant-readiness-20261022.json', import.meta.url), 'utf8'));
const manifest = evidence.formalRepairCandidates;
const sql = readFileSync(new URL('./repair_legacy_formal_tenants.sql', import.meta.url), 'utf8');
async function seed() {
  const db = await PGlite.create();
  await db.exec(`CREATE TABLE tenants(tenant_id text PRIMARY KEY);
    CREATE TABLE quotes(quote_id text PRIMARY KEY,tenant_id text);
    CREATE TABLE formal_proposals(proposal_doc_id text PRIMARY KEY,quote_id text,proposal_id text,tenant_id text);`);
  for (const tenant of new Set(manifest.map(m => m.tenantId))) await db.query('INSERT INTO tenants VALUES($1)', [tenant]);
  for (const m of manifest) {
    await db.query('INSERT INTO quotes VALUES($1,$2) ON CONFLICT DO NOTHING', [m.quoteId,m.tenantId]);
    await db.query('INSERT INTO formal_proposals VALUES($1,$2,NULL,NULL)', [m.documentId,m.quoteId]);
  }
  await db.query("INSERT INTO formal_proposals VALUES('unlisted-document',$1,NULL,NULL)", [manifest[0].quoteId]);
  return db;
}
const db = await seed();
try {
  await db.exec(sql);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM formal_proposals WHERE tenant_id IS NOT NULL')).rows[0].n),12);
  assert.equal((await db.query("SELECT tenant_id FROM formal_proposals WHERE proposal_doc_id='unlisted-document'")).rows[0].tenant_id,null);
  const audit = (await db.query('SELECT * FROM formal_document_tenant_repairs ORDER BY document_id')).rows;
  assert.equal(audit.length,12);
  await db.exec(sql);
  assert.deepEqual((await db.query('SELECT * FROM formal_document_tenant_repairs ORDER BY document_id')).rows,audit);
} finally { await db.close(); }
for (const divergence of ['quote','document']) {
  const bad = await seed();
  try {
    const other = manifest.find(m => m.tenantId !== manifest[0].tenantId).tenantId;
    if (divergence === 'quote') await bad.query('UPDATE quotes SET tenant_id=$1 WHERE quote_id=$2',[other,manifest[0].quoteId]);
    else await bad.query('UPDATE formal_proposals SET tenant_id=$1 WHERE proposal_doc_id=$2',[other,manifest[0].documentId]);
    await assert.rejects(bad.exec(sql),/manifest does not match/);
    await bad.exec('ROLLBACK');
    const count = Number((await bad.query('SELECT count(*) AS n FROM formal_proposals WHERE tenant_id IS NOT NULL')).rows[0].n);
    assert.equal(count,divergence === 'quote' ? 0 : 1);
    assert.equal((await bad.query("SELECT to_regclass('formal_document_tenant_repairs') AS audit")).rows[0].audit,null);
  } finally { await bad.close(); }
}
console.log('PASS: 12 exact repairs, unlisted rows untouched, idempotent audit, divergent quote/document both abort without partial writes.');
