-- Apply after 20261022_multitenant_foundation.sql on validation branch first.
-- No reassignment or deletion: invalid legacy relationships abort atomically.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE UNIQUE INDEX IF NOT EXISTS crm_proposals_tenant_id_unique ON proposals(tenant_id, proposal_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_items_proposal_tenant_fk' AND conrelid = 'proposal_items'::regclass) THEN
    ALTER TABLE proposal_items ADD CONSTRAINT document_items_proposal_tenant_fk
      FOREIGN KEY (tenant_id, proposal_id) REFERENCES proposals (tenant_id, proposal_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE proposal_items VALIDATE CONSTRAINT document_items_proposal_tenant_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_formal_proposal_tenant_fk' AND conrelid = 'formal_proposals'::regclass) THEN
    ALTER TABLE formal_proposals ADD CONSTRAINT document_formal_proposal_tenant_fk
      FOREIGN KEY (tenant_id, proposal_id) REFERENCES proposals (tenant_id, proposal_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE formal_proposals VALIDATE CONSTRAINT document_formal_proposal_tenant_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_audit_proposal_tenant_fk' AND conrelid = 'proposal_audit_events'::regclass) THEN
    ALTER TABLE proposal_audit_events ADD CONSTRAINT document_audit_proposal_tenant_fk
      FOREIGN KEY (tenant_id, proposal_id) REFERENCES proposals (tenant_id, proposal_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE proposal_audit_events VALIDATE CONSTRAINT document_audit_proposal_tenant_fk;
COMMIT;
