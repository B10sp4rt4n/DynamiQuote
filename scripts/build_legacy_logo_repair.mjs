// Offline SQL generator. It never reads credentials or connects to a database.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function buildLegacyLogoRepair(manifest) {
  const { copies, references } = manifest;
  if (!copies?.length || !references?.length) throw new Error('Empty manifest');
  const literal = value => {
    if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Invalid manifest string');
    return "'" + value.replaceAll("'", "''") + "'";
  };
  const copyById = new Map();
  const pairs = new Set();
  for (const c of copies) {
    const pair = JSON.stringify([c.sourceLogoId,c.tenantId]);
    if (!/^[a-f0-9]{32}$/.test(c.sourceHash) || pairs.has(pair) || copyById.has(c.copyLogoId)
      || c.copyLogoId !== `crm-legacy-logo:${c.tenantId}:${c.sourceLogoId}`) throw new Error('Invalid copy manifest');
    pairs.add(pair); copyById.set(c.copyLogoId,c);
  }
  const keys = new Set();
  for (const r of references) {
    const c = copyById.get(r.copyLogoId);
    const key = JSON.stringify([r.parentTable,r.parentId,r.field]);
    if (keys.has(key) || !c || c.sourceLogoId !== r.sourceLogoId || c.tenantId !== r.tenantId
      || !((r.parentTable === 'formal_proposals' && ['issuer_logo_id','client_logo_id'].includes(r.field))
        || (r.parentTable === 'clients' && r.field === 'client_logo_id'))) throw new Error('Invalid reference manifest');
    keys.add(key);
  }
  if (copies.some(c => !references.some(r => r.copyLogoId === c.copyLogoId))) throw new Error('Copy without reference');
  const currentRefs = `SELECT 'formal_proposals'::text AS parent_table,proposal_doc_id AS parent_id,
    'issuer_logo_id'::text AS field,tenant_id,issuer_logo_id AS logo_id FROM formal_proposals
    UNION ALL SELECT 'formal_proposals',proposal_doc_id,'client_logo_id',tenant_id,client_logo_id FROM formal_proposals
    UNION ALL SELECT 'clients',client_id,'client_logo_id',tenant_id,client_logo_id FROM clients`;
  const statements = [
    "SET LOCAL lock_timeout = '5s';",
    // Prevent another writer changing a source/reference between verification and update.
    'LOCK TABLE company_logos,formal_proposals,clients IN SHARE ROW EXCLUSIVE MODE;',
    `CREATE TEMP TABLE crm_logo_copy_manifest(source_logo_id text NOT NULL,tenant_id text NOT NULL,
      copy_logo_id text UNIQUE NOT NULL,source_hash text NOT NULL,PRIMARY KEY(source_logo_id,tenant_id)) ON COMMIT DROP;`,
    `INSERT INTO crm_logo_copy_manifest VALUES\n${copies.map(c => '('+[c.sourceLogoId,c.tenantId,c.copyLogoId,c.sourceHash].map(literal).join(',')+')').join(',\n')};`,
    `CREATE TEMP TABLE crm_logo_ref_manifest(parent_table text NOT NULL,parent_id text NOT NULL,field text NOT NULL,
      tenant_id text NOT NULL,source_logo_id text NOT NULL,copy_logo_id text NOT NULL,
      PRIMARY KEY(parent_table,parent_id,field)) ON COMMIT DROP;`,
    `INSERT INTO crm_logo_ref_manifest VALUES\n${references.map(r => '('+[r.parentTable,r.parentId,r.field,r.tenantId,r.sourceLogoId,r.copyLogoId].map(literal).join(',')+')').join(',\n')};`,
    `CREATE TABLE IF NOT EXISTS legacy_logo_tenant_copies(source_logo_id text NOT NULL,tenant_id text NOT NULL,
      copy_logo_id text UNIQUE NOT NULL,source_hash text NOT NULL,rule text NOT NULL,
      recorded_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(source_logo_id,tenant_id));`,
    `CREATE TABLE IF NOT EXISTS legacy_logo_reference_repairs(parent_table text NOT NULL,parent_id text NOT NULL,
      field text NOT NULL,tenant_id text NOT NULL,previous_logo_id text NOT NULL,assigned_logo_id text NOT NULL,
      rule text NOT NULL,recorded_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(parent_table,parent_id,field));`,
    `DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM crm_logo_copy_manifest m LEFT JOIN company_logos s ON s.logo_id=m.source_logo_id
        LEFT JOIN tenants t ON t.tenant_id=m.tenant_id
        WHERE s.logo_id IS NULL OR s.tenant_id IS NOT NULL OR t.tenant_id IS NULL
          OR md5(to_jsonb(s)::text) IS DISTINCT FROM m.source_hash)
      THEN RAISE EXCEPTION 'Logo source manifest changed; no repair applied'; END IF;
      IF EXISTS(SELECT 1 FROM crm_logo_copy_manifest m JOIN company_logos s ON s.logo_id=m.source_logo_id
        LEFT JOIN company_logos c ON c.logo_id=m.copy_logo_id
        LEFT JOIN legacy_logo_tenant_copies a ON a.source_logo_id=m.source_logo_id AND a.tenant_id=m.tenant_id
        WHERE (c.logo_id IS NULL) IS DISTINCT FROM (a.copy_logo_id IS NULL)
          OR (c.logo_id IS NOT NULL AND to_jsonb(c) IS DISTINCT FROM
            (to_jsonb(s)||jsonb_build_object('logo_id',m.copy_logo_id,'tenant_id',m.tenant_id,'is_default',false)))
          OR (a.copy_logo_id IS NOT NULL AND (a.copy_logo_id IS DISTINCT FROM m.copy_logo_id
            OR a.source_hash IS DISTINCT FROM m.source_hash OR a.rule IS DISTINCT FROM 'exact_parent_tenant_copy')))
      THEN RAISE EXCEPTION 'Logo copy or audit conflict; no repair applied'; END IF;
      IF EXISTS(SELECT 1 FROM crm_logo_ref_manifest m LEFT JOIN (${currentRefs}) r
        ON r.parent_table=m.parent_table AND r.parent_id=m.parent_id AND r.field=m.field
        LEFT JOIN legacy_logo_reference_repairs a
        ON a.parent_table=m.parent_table AND a.parent_id=m.parent_id AND a.field=m.field
        WHERE r.parent_id IS NULL OR r.tenant_id IS DISTINCT FROM m.tenant_id
          OR r.logo_id IS NULL OR r.logo_id NOT IN (m.source_logo_id,m.copy_logo_id)
          OR (r.logo_id=m.copy_logo_id AND a.parent_id IS NULL)
          OR (a.parent_id IS NOT NULL AND (a.tenant_id IS DISTINCT FROM m.tenant_id
            OR a.previous_logo_id IS DISTINCT FROM m.source_logo_id OR a.assigned_logo_id IS DISTINCT FROM m.copy_logo_id
            OR a.rule IS DISTINCT FROM 'exact_parent_tenant_copy')))
      THEN RAISE EXCEPTION 'Logo reference or audit conflict; no repair applied'; END IF;
    END $$;`,
    `INSERT INTO company_logos(logo_id,logo_name,logo_type,company_name,logo_data,logo_format,uploaded_at,is_default,tenant_id)
      SELECT m.copy_logo_id,s.logo_name,s.logo_type,s.company_name,s.logo_data,s.logo_format,s.uploaded_at,false,m.tenant_id
      FROM crm_logo_copy_manifest m JOIN company_logos s ON s.logo_id=m.source_logo_id
      WHERE NOT EXISTS(SELECT 1 FROM company_logos c WHERE c.logo_id=m.copy_logo_id);`,
    `INSERT INTO legacy_logo_tenant_copies(source_logo_id,tenant_id,copy_logo_id,source_hash,rule)
      SELECT source_logo_id,tenant_id,copy_logo_id,source_hash,'exact_parent_tenant_copy' FROM crm_logo_copy_manifest
      ON CONFLICT(source_logo_id,tenant_id) DO NOTHING;`,
    `INSERT INTO legacy_logo_reference_repairs(parent_table,parent_id,field,tenant_id,previous_logo_id,assigned_logo_id,rule)
      SELECT parent_table,parent_id,field,tenant_id,source_logo_id,copy_logo_id,'exact_parent_tenant_copy' FROM crm_logo_ref_manifest
      ON CONFLICT(parent_table,parent_id,field) DO NOTHING;`,
    ...[['formal_proposals','issuer_logo_id','proposal_doc_id'],['formal_proposals','client_logo_id','proposal_doc_id'],['clients','client_logo_id','client_id']].map(([table,field,id]) =>
      `UPDATE ${table} p SET ${field}=m.copy_logo_id FROM crm_logo_ref_manifest m
        WHERE m.parent_table='${table}' AND m.field='${field}' AND p.${id}=m.parent_id
          AND p.tenant_id=m.tenant_id AND p.${field}=m.source_logo_id;`),
    `DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM crm_logo_copy_manifest m JOIN company_logos s ON s.logo_id=m.source_logo_id
        LEFT JOIN company_logos c ON c.logo_id=m.copy_logo_id
        WHERE c.logo_id IS NULL OR to_jsonb(c) IS DISTINCT FROM
          (to_jsonb(s)||jsonb_build_object('logo_id',m.copy_logo_id,'tenant_id',m.tenant_id,'is_default',false)))
      THEN RAISE EXCEPTION 'Logo copy content postcondition failed'; END IF;
      IF EXISTS(SELECT 1 FROM crm_logo_ref_manifest m LEFT JOIN (${currentRefs}) r
        ON r.parent_table=m.parent_table AND r.parent_id=m.parent_id AND r.field=m.field
        WHERE r.parent_id IS NULL OR r.tenant_id IS DISTINCT FROM m.tenant_id OR r.logo_id IS DISTINCT FROM m.copy_logo_id)
      THEN RAISE EXCEPTION 'Logo reference postcondition failed'; END IF;
      IF EXISTS(SELECT 1 FROM (${currentRefs}) r JOIN tenants t ON t.tenant_id=r.tenant_id
        JOIN company_logos l ON l.logo_id=r.logo_id WHERE l.tenant_id IS NULL)
      THEN RAISE EXCEPTION 'Unlisted global logo reference remains; refresh manifest'; END IF;
    END $$;`,
    `SELECT (SELECT count(*) FROM crm_logo_copy_manifest) AS copies_verified,
      (SELECT count(*) FROM crm_logo_ref_manifest) AS references_verified;`
  ];
  return statements;
}

export function renderLegacyLogoRepair(manifest) {
  return '-- Rehearsal only: br-old-pond-ahe5jto3. Do not apply to production without approval.\n'
    + '-- Generated offline from docs/evidence/legacy-logo-repair-manifest-20261022.json.\n'
    + '-- Apply document tenant repair first. All original assets and existing defaults are preserved.\nBEGIN;\n'
    + buildLegacyLogoRepair(manifest).map(s => '-- statement-breakpoint\n'+s).join('\n')+'\nCOMMIT;\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(readFileSync(new URL('../docs/evidence/legacy-logo-repair-manifest-20261022.json',import.meta.url),'utf8'));
  writeFileSync(new URL('./repair_legacy_logo_tenants.sql',import.meta.url),renderLegacyLogoRepair(manifest));
  console.log(`Generated ${manifest.copies.length} copies and ${manifest.references.length} references; no database accessed.`);
}
