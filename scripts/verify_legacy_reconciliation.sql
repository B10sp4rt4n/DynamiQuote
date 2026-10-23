-- Read only. Run on isolated br-old-pond-ahe5jto3 AFTER both rehearsals.
SELECT now() AS checked_at,
(SELECT count(*) FROM formal_proposals) AS documents,
(SELECT count(*) FROM formal_proposals WHERE tenant_id IS NULL) AS documents_without_tenant,
(SELECT count(*) FROM company_logos) AS logos,
(SELECT count(*) FROM company_logos WHERE tenant_id IS NULL) AS global_logos,
(SELECT md5(string_agg(proposal_doc_id||':'||md5((to_jsonb(f)-'tenant_id'-'issuer_logo_id'-'client_logo_id')::text),',' ORDER BY proposal_doc_id)) FROM formal_proposals f) AS document_content_hash,
(SELECT md5(string_agg(client_id||':'||md5((to_jsonb(c)-'client_logo_id')::text),',' ORDER BY client_id)) FROM clients c) AS clients_excluding_logo_hash,
(SELECT md5(string_agg(logo_id||':'||md5(to_jsonb(l)::text),',' ORDER BY logo_id)) FROM company_logos l WHERE tenant_id IS NULL) AS original_global_assets_hash,
(SELECT md5(string_agg(quote_id||':'||md5(to_jsonb(q)::text),',' ORDER BY quote_id)) FROM quotes q) AS quotes_hash,
(SELECT md5(string_agg(proposal_id||':'||md5(to_jsonb(p)::text),',' ORDER BY proposal_id)) FROM proposals p) AS proposals_hash,
(SELECT md5(string_agg(opportunity_id||':'||md5(to_jsonb(o)::text),',' ORDER BY opportunity_id)) FROM opportunities o) AS opportunities_hash,
(SELECT md5(string_agg(proposal_id||':'||md5(to_jsonb(p)::text),',' ORDER BY proposal_id)) FROM proposals p WHERE tenant_id='default-tenant') AS unassigned_proposals_hash,
(SELECT count(*) FROM proposals WHERE tenant_id='default-tenant') AS unassigned_proposals,
(SELECT count(*) FROM formal_document_tenant_repairs) AS repaired_documents,
(SELECT md5(string_agg(document_id||':'||md5(to_jsonb(a)::text),',' ORDER BY document_id)) FROM formal_document_tenant_repairs a) AS document_audit_hash;

WITH refs AS (
SELECT 'formal_proposals' AS parent_table,proposal_doc_id AS parent_id,'issuer_logo_id' AS field,tenant_id,issuer_logo_id AS logo_id FROM formal_proposals
UNION ALL SELECT 'formal_proposals',proposal_doc_id,'client_logo_id',tenant_id,client_logo_id FROM formal_proposals
UNION ALL SELECT 'clients',client_id,'client_logo_id',tenant_id,client_logo_id FROM clients
)
SELECT (SELECT count(*) FROM refs r JOIN tenants t ON t.tenant_id=r.tenant_id JOIN company_logos l ON l.logo_id=r.logo_id WHERE l.tenant_id IS NULL) AS known_parent_global_refs,
(SELECT count(*) FROM refs r JOIN tenants t ON t.tenant_id=r.tenant_id JOIN company_logos l ON l.logo_id=r.logo_id WHERE l.tenant_id IS DISTINCT FROM r.tenant_id) AS known_parent_foreign_refs,
(SELECT count(*) FROM legacy_logo_tenant_copies) AS copy_audit_records,
(SELECT count(*) FROM legacy_logo_reference_repairs) AS reference_audit_records,
(SELECT count(*) FROM legacy_logo_tenant_copies a JOIN company_logos s ON s.logo_id=a.source_logo_id JOIN company_logos c ON c.logo_id=a.copy_logo_id WHERE c.logo_data IS DISTINCT FROM s.logo_data OR c.logo_format IS DISTINCT FROM s.logo_format OR c.company_name IS DISTINCT FROM s.company_name OR c.tenant_id IS DISTINCT FROM a.tenant_id OR c.is_default IS DISTINCT FROM false) AS invalid_copies,
(SELECT md5(string_agg(copy_logo_id||':'||md5(to_jsonb(a)::text),',' ORDER BY copy_logo_id)) FROM legacy_logo_tenant_copies a) AS copy_audit_hash,
(SELECT md5(string_agg(parent_table||':'||parent_id||':'||field||':'||md5(to_jsonb(a)::text),',' ORDER BY parent_table,parent_id,field)) FROM legacy_logo_reference_repairs a) AS reference_audit_hash;
