-- Rehearsal authorized only for isolated br-old-pond-ahe5jto3. Production requires separate approval.
-- -- statement-breakpoint separates complete statements for transaction APIs.
-- Repairs ONLY the 12 document IDs in the explicit manifest, using their exact quote FK.
-- No deletion, ownership inference, new tenant, or reassignment of existing non-null tenants.
BEGIN;
-- statement-breakpoint
SET LOCAL lock_timeout = '5s';
-- statement-breakpoint
CREATE TEMP TABLE crm_formal_tenant_manifest (
  document_id text PRIMARY KEY, quote_id text NOT NULL, tenant_id text NOT NULL
) ON COMMIT DROP;
-- statement-breakpoint
INSERT INTO crm_formal_tenant_manifest VALUES
('41a8ff1a-eaa6-499f-98f0-f41bdcae8b2e', '7fc98f3a-9e82-48e9-8731-0301ed998e0b', '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157'),
('312bb754-809c-4f51-b1d0-8558bb2e17d7', '7fc98f3a-9e82-48e9-8731-0301ed998e0b', '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157'),
('72e6bc11-8035-4978-8045-8120c1062695', '7fc98f3a-9e82-48e9-8731-0301ed998e0b', '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157'),
('2b304d7e-e45f-492d-9daa-c671c818d5aa', '422a11f1-4fed-4355-a74e-8cb7a8ba5004', 'b0e92d15-2e87-4c1a-93ac-3399bf8fe515'),
('198a9a3e-c5a6-466d-b006-30ca90990a09', '15b5e3ec-11cf-46dc-a0eb-64d264a629fa', '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157'),
('17aef362-951c-4ee7-85c7-fefcb3fa6d3c', '67529ddc-ce42-4c44-87ae-5ad46eb395ae', '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157'),
('63aa357d-aef9-428a-a680-9776c7202188', 'f79d0b29-85b0-49b3-b676-1f5742d80673', 'b0e92d15-2e87-4c1a-93ac-3399bf8fe515'),
('ad0f0b26-3592-4c72-90e9-abe1b83e50c8', 'f79d0b29-85b0-49b3-b676-1f5742d80673', 'b0e92d15-2e87-4c1a-93ac-3399bf8fe515'),
('ee0675dc-b843-4a53-b084-4b75ee8637b2', '53dc3291-b903-4922-9a4c-41498a067a05', '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157'),
('76e9b35f-1fa2-486e-bd17-13122b26912a', '80485c75-9cc2-465c-ac04-6708d9d0c0a7', 'b0e92d15-2e87-4c1a-93ac-3399bf8fe515'),
('1d35c5e2-b555-4097-818b-07077df3b7fe', '80485c75-9cc2-465c-ac04-6708d9d0c0a7', 'b0e92d15-2e87-4c1a-93ac-3399bf8fe515'),
('3d25cd8a-f9e9-4a6f-a849-a8385dcbaf3e', '2b5c2c27-f102-42cd-bbc9-bff7128a89de', 'b0e92d15-2e87-4c1a-93ac-3399bf8fe515');
-- statement-breakpoint
DO $$ BEGIN
  PERFORM 1 FROM formal_proposals f JOIN quotes q ON q.quote_id=f.quote_id
    JOIN crm_formal_tenant_manifest m ON m.document_id=f.proposal_doc_id
    FOR UPDATE OF f,q;
  IF EXISTS (
    SELECT 1 FROM crm_formal_tenant_manifest m
    LEFT JOIN formal_proposals f ON f.proposal_doc_id=m.document_id
    LEFT JOIN quotes q ON q.quote_id=m.quote_id
    LEFT JOIN tenants t ON t.tenant_id=m.tenant_id
    WHERE f.proposal_doc_id IS NULL OR q.quote_id IS NULL OR t.tenant_id IS NULL
      OR f.quote_id IS DISTINCT FROM m.quote_id OR f.proposal_id IS NOT NULL
      OR q.tenant_id IS DISTINCT FROM m.tenant_id
      OR (f.tenant_id IS NOT NULL AND f.tenant_id IS DISTINCT FROM m.tenant_id)
  ) THEN RAISE EXCEPTION 'Formal tenant repair manifest does not match current parentage; no repair applied';
  END IF;
END $$;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS formal_document_tenant_repairs (
  document_id text PRIMARY KEY, previous_tenant_id text,
  assigned_tenant_id text NOT NULL, source_quote_id text NOT NULL,
  rule text NOT NULL, recorded_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM formal_document_tenant_repairs a
    JOIN crm_formal_tenant_manifest m USING(document_id)
    WHERE a.assigned_tenant_id IS DISTINCT FROM m.tenant_id
      OR a.source_quote_id IS DISTINCT FROM m.quote_id
  ) THEN RAISE EXCEPTION 'Existing repair audit conflicts with this manifest'; END IF;
END $$;
-- statement-breakpoint
INSERT INTO formal_document_tenant_repairs
  (document_id,previous_tenant_id,assigned_tenant_id,source_quote_id,rule)
SELECT f.proposal_doc_id,f.tenant_id,m.tenant_id,m.quote_id,'exact_quote_fk'
FROM formal_proposals f JOIN crm_formal_tenant_manifest m ON m.document_id=f.proposal_doc_id
WHERE f.tenant_id IS NULL
ON CONFLICT (document_id) DO NOTHING;
-- statement-breakpoint
UPDATE formal_proposals f SET tenant_id=m.tenant_id
FROM crm_formal_tenant_manifest m
WHERE f.proposal_doc_id=m.document_id AND f.tenant_id IS NULL;
-- statement-breakpoint
SELECT count(*) AS manifest_documents_resolved
FROM formal_proposals f JOIN crm_formal_tenant_manifest m ON m.document_id=f.proposal_doc_id
WHERE f.tenant_id=m.tenant_id;
COMMIT;
