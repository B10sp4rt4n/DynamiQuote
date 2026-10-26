// Local-only PostgreSQL rehearsal; never reads DATABASE_URL or contacts Neon.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLegacyLogoRepair, renderLegacyLogoRepair } from './build_legacy_logo_repair.mjs';
if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to a temporary PGlite installation');
const { PGlite } = await import(process.env.PGLITE_MODULE);

async function seed() {
  const db = await PGlite.create();
  await db.exec(`CREATE TABLE tenants(tenant_id text PRIMARY KEY);
    CREATE TABLE company_logos(logo_id text PRIMARY KEY,logo_name text NOT NULL,logo_type text NOT NULL,
      company_name text,logo_data bytea NOT NULL,logo_format text NOT NULL,uploaded_at timestamp(6) NOT NULL,
      is_default boolean DEFAULT false,tenant_id text REFERENCES tenants);
    CREATE TABLE formal_proposals(proposal_doc_id text PRIMARY KEY,tenant_id text REFERENCES tenants,
      issuer_logo_id text REFERENCES company_logos,client_logo_id text REFERENCES company_logos,
      amount numeric,issued_date date,content text);
    CREATE TABLE clients(client_id text PRIMARY KEY,tenant_id text REFERENCES tenants,
      client_logo_id text REFERENCES company_logos,company_name text);
    INSERT INTO tenants VALUES('tenant-a'),('tenant-b');
    INSERT INTO company_logos VALUES
      ('shared','Legacy','issuer','Original',decode('89504e4700ff','hex'),'png','2026-02-01',true,NULL),
      ('unused','Unused','client',NULL,decode('00aa','hex'),'jpg','2026-02-02',NULL,NULL),
      ('owned','Current','issuer','A',decode('aabb','hex'),'png','2026-02-03',true,'tenant-a');
    INSERT INTO formal_proposals VALUES
      ('doc-a','tenant-a','shared','shared',123.45,'2026-02-10','preserve historical content'),
      ('doc-b','tenant-b','shared',NULL,567.89,'2026-02-11','other company'),
      ('unassigned',NULL,'unused',NULL,999,'2026-02-12','remain isolated');
    INSERT INTO clients VALUES('client-a','tenant-a','shared','A client');`);
  const sourceHash = (await db.query("SELECT md5(to_jsonb(l)::text) AS hash FROM company_logos l WHERE logo_id='shared'")).rows[0].hash;
  const manifest = {copies:['tenant-a','tenant-b'].map(tenantId => ({sourceLogoId:'shared',tenantId,copyLogoId:`crm-legacy-logo:${tenantId}:shared`,sourceHash})),
    references:[['formal_proposals','doc-a','issuer_logo_id','tenant-a'],['formal_proposals','doc-a','client_logo_id','tenant-a'],
      ['formal_proposals','doc-b','issuer_logo_id','tenant-b'],['clients','client-a','client_logo_id','tenant-a']]
      .map(([parentTable,parentId,field,tenantId]) => ({parentTable,parentId,field,tenantId,sourceLogoId:'shared',copyLogoId:`crm-legacy-logo:${tenantId}:shared`}))};
  return {db,manifest};
}
const {db,manifest} = await seed();
try {
  const originals = (await db.query('SELECT * FROM company_logos ORDER BY logo_id')).rows;
  const content = (await db.query("SELECT proposal_doc_id,amount,issued_date,content FROM formal_proposals ORDER BY proposal_doc_id")).rows;
  await db.exec(renderLegacyLogoRepair(manifest));
  assert.deepEqual((await db.query("SELECT * FROM company_logos WHERE logo_id IN ('shared','unused','owned') ORDER BY logo_id")).rows,originals);
  const copies = (await db.query("SELECT * FROM company_logos WHERE logo_id LIKE 'crm-legacy-logo:%' ORDER BY logo_id")).rows;
  assert.equal(copies.length,2);
  const source = originals.find(r => r.logo_id === 'shared');
  for (const c of copies) assert.deepEqual(c,{...source,logo_id:`crm-legacy-logo:${c.tenant_id}:shared`,tenant_id:c.tenant_id,is_default:false});
  assert.deepEqual((await db.query("SELECT proposal_doc_id,amount,issued_date,content FROM formal_proposals ORDER BY proposal_doc_id")).rows,content);
  assert.equal((await db.query("SELECT issuer_logo_id FROM formal_proposals WHERE proposal_doc_id='doc-a'")).rows[0].issuer_logo_id,'crm-legacy-logo:tenant-a:shared');
  assert.equal((await db.query("SELECT issuer_logo_id FROM formal_proposals WHERE proposal_doc_id='doc-b'")).rows[0].issuer_logo_id,'crm-legacy-logo:tenant-b:shared');
  assert.equal((await db.query("SELECT client_logo_id FROM clients WHERE client_id='client-a'")).rows[0].client_logo_id,'crm-legacy-logo:tenant-a:shared');
  assert.equal((await db.query("SELECT issuer_logo_id FROM formal_proposals WHERE proposal_doc_id='unassigned'")).rows[0].issuer_logo_id,'unused');
  const audit = (await db.query('SELECT * FROM legacy_logo_reference_repairs ORDER BY parent_table,parent_id,field')).rows;
  const copyAudit = (await db.query('SELECT * FROM legacy_logo_tenant_copies ORDER BY tenant_id')).rows;
  assert.equal(audit.length,4); assert.equal(copyAudit.length,2);
  await db.exec(renderLegacyLogoRepair(manifest));
  assert.deepEqual((await db.query('SELECT * FROM legacy_logo_reference_repairs ORDER BY parent_table,parent_id,field')).rows,audit);
  assert.deepEqual((await db.query('SELECT * FROM legacy_logo_tenant_copies ORDER BY tenant_id')).rows,copyAudit);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM company_logos')).rows[0].n),5);
} finally { await db.close(); }

for (const fault of ['source','tenant','reference','collision','unlisted','audit']) {
  const {db:bad,manifest:m} = await seed();
  try {
    if (fault === 'source') await bad.exec("UPDATE company_logos SET logo_data=decode('aa','hex') WHERE logo_id='shared'");
    if (fault === 'tenant') await bad.exec("UPDATE formal_proposals SET tenant_id='tenant-b' WHERE proposal_doc_id='doc-a'");
    if (fault === 'reference') await bad.exec("UPDATE formal_proposals SET issuer_logo_id='owned' WHERE proposal_doc_id='doc-a'");
    if (fault === 'collision') await bad.exec("INSERT INTO company_logos SELECT 'crm-legacy-logo:tenant-a:shared',logo_name,logo_type,company_name,logo_data,logo_format,uploaded_at,is_default,tenant_id FROM company_logos WHERE logo_id='owned'");
    if (fault === 'unlisted') await bad.exec("INSERT INTO clients VALUES('unlisted-client','tenant-a','unused','Unlisted')");
    if (fault === 'audit') {
      await bad.exec(renderLegacyLogoRepair(m));
      await bad.exec("UPDATE legacy_logo_reference_repairs SET previous_logo_id='wrong' WHERE parent_id='doc-a'");
    }
    const before = (await bad.query("SELECT jsonb_agg(to_jsonb(l) ORDER BY logo_id) AS logos FROM company_logos l")).rows;
    const refsBefore = (await bad.query("SELECT jsonb_agg(to_jsonb(f) ORDER BY proposal_doc_id) AS docs FROM formal_proposals f")).rows;
    await assert.rejects(bad.exec(renderLegacyLogoRepair(m)),/manifest changed|conflict|Unlisted global/);
    await bad.exec('ROLLBACK');
    assert.deepEqual((await bad.query("SELECT jsonb_agg(to_jsonb(l) ORDER BY logo_id) AS logos FROM company_logos l")).rows,before);
    assert.deepEqual((await bad.query("SELECT jsonb_agg(to_jsonb(f) ORDER BY proposal_doc_id) AS docs FROM formal_proposals f")).rows,refsBefore);
    if (fault !== 'audit') assert.equal((await bad.query("SELECT to_regclass('legacy_logo_tenant_copies') AS audit")).rows[0].audit,null);
  } finally { await bad.close(); }
}
const realManifest = JSON.parse(readFileSync(new URL('../docs/evidence/legacy-logo-repair-manifest-20261022.json',import.meta.url),'utf8'));
assert.equal(realManifest.copies.length,45); assert.equal(realManifest.references.length,132);
assert.equal(renderLegacyLogoRepair(realManifest),readFileSync(new URL('./repair_legacy_logo_tenants.sql',import.meta.url),'utf8'));
assert.throws(() => buildLegacyLogoRepair({...manifest,references:[...manifest.references,manifest.references[0]]}),/Invalid reference/);
console.log('PASS: shared assets copied per tenant; bytes/content/defaults/originals preserved; idempotent audit; six divergence cases roll back; generated SQL matches 45-copy/132-reference manifest.');
