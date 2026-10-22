-- Phase zero: additive, transactional and rerunnable. No reassignment/deletion.
-- Apply on an isolated Neon branch first. Historical violations abort this
-- entire transaction at VALIDATE; investigate them rather than inventing owners.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS tenant_context_events (
  event_id text PRIMARY KEY,
  actor_user_id text NOT NULL,
  from_tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  to_tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS tenant_context_events_actor_date ON tenant_context_events(actor_user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS crm_clients_tenant_id_unique ON clients(tenant_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_tenant_id_unique ON opportunities(tenant_id, opportunity_id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_client_id_unique ON opportunities(tenant_id, client_id, opportunity_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_opportunities_tenant_fk' AND conrelid = 'opportunities'::regclass) THEN
    ALTER TABLE opportunities ADD CONSTRAINT crm_opportunities_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE opportunities VALIDATE CONSTRAINT crm_opportunities_tenant_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_opportunities_client_fk' AND conrelid = 'opportunities'::regclass) THEN
    ALTER TABLE opportunities ADD CONSTRAINT crm_opportunities_client_fk
      FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, client_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE opportunities VALIDATE CONSTRAINT crm_opportunities_client_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_contacts_client_fk' AND conrelid = 'client_contacts'::regclass) THEN
    ALTER TABLE client_contacts ADD CONSTRAINT crm_contacts_client_fk
      FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, client_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE client_contacts VALIDATE CONSTRAINT crm_contacts_client_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_client_fk' AND conrelid = 'tasks'::regclass) THEN
    ALTER TABLE tasks ADD CONSTRAINT crm_tasks_client_fk
      FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, client_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE tasks VALIDATE CONSTRAINT crm_tasks_client_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_opportunity_fk' AND conrelid = 'tasks'::regclass) THEN
    ALTER TABLE tasks ADD CONSTRAINT crm_tasks_opportunity_fk
      FOREIGN KEY (tenant_id, client_id, opportunity_id) REFERENCES opportunities (tenant_id, client_id, opportunity_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE tasks VALIDATE CONSTRAINT crm_tasks_opportunity_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_interactions_client_fk' AND conrelid = 'interaction_logs'::regclass) THEN
    ALTER TABLE interaction_logs ADD CONSTRAINT crm_interactions_client_fk
      FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, client_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE interaction_logs VALIDATE CONSTRAINT crm_interactions_client_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_interactions_opportunity_fk' AND conrelid = 'interaction_logs'::regclass) THEN
    ALTER TABLE interaction_logs ADD CONSTRAINT crm_interactions_opportunity_fk
      FOREIGN KEY (tenant_id, client_id, opportunity_id) REFERENCES opportunities (tenant_id, client_id, opportunity_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE interaction_logs VALIDATE CONSTRAINT crm_interactions_opportunity_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_quotes_client_fk' AND conrelid = 'quotes'::regclass) THEN
    ALTER TABLE quotes ADD CONSTRAINT crm_quotes_client_fk
      FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, client_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE quotes VALIDATE CONSTRAINT crm_quotes_client_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_quotes_opportunity_fk' AND conrelid = 'quotes'::regclass) THEN
    ALTER TABLE quotes ADD CONSTRAINT crm_quotes_opportunity_fk
      FOREIGN KEY (tenant_id, opportunity_id) REFERENCES opportunities (tenant_id, opportunity_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE quotes VALIDATE CONSTRAINT crm_quotes_opportunity_fk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_proposals_opportunity_fk' AND conrelid = 'proposals'::regclass) THEN
    ALTER TABLE proposals ADD CONSTRAINT crm_proposals_opportunity_fk
      FOREIGN KEY (tenant_id, opportunity_id) REFERENCES opportunities (tenant_id, opportunity_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE proposals VALIDATE CONSTRAINT crm_proposals_opportunity_fk;
COMMIT;
