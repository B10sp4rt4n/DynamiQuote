-- R1 additive pilot. Run explicitly, after tenant capabilities; never during build.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE UNIQUE INDEX IF NOT EXISTS recurring_clients_tenant_id ON clients(tenant_id,client_id);
CREATE TABLE IF NOT EXISTS recurring_counters (
  tenant_id text PRIMARY KEY REFERENCES tenants(tenant_id),
  next_number bigint NOT NULL CHECK(next_number>0)
);
CREATE TABLE IF NOT EXISTS recurring_agreements (
  tenant_id text NOT NULL CHECK(tenant_id='389b6cc1-2f8d-4fe4-bc3d-f50f92df3157') REFERENCES tenants(tenant_id),
  agreement_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  agreement_number text NOT NULL,
  client_id text,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  terms_revision integer NOT NULL DEFAULT 1 CHECK(terms_revision>0),
  status text NOT NULL CHECK(status IN ('draft','active','paused','ended')),
  terms jsonb NOT NULL,
  generation_floor date,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,agreement_id),
  UNIQUE(tenant_id,request_id),
  UNIQUE(tenant_id,agreement_number),
  FOREIGN KEY(tenant_id,client_id) REFERENCES clients(tenant_id,client_id)
);
CREATE TABLE IF NOT EXISTS recurring_agreement_versions (
  tenant_id text NOT NULL,
  agreement_id uuid NOT NULL,
  terms_revision integer NOT NULL CHECK(terms_revision>0),
  effective_from date,
  snapshot jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,agreement_id,terms_revision),
  FOREIGN KEY(tenant_id,agreement_id) REFERENCES recurring_agreements(tenant_id,agreement_id)
);
CREATE TABLE IF NOT EXISTS recurring_periods (
  tenant_id text NOT NULL,
  agreement_id uuid NOT NULL,
  coverage_start date NOT NULL,
  coverage_end date NOT NULL CHECK(coverage_end>coverage_start),
  prepare_on date NOT NULL,
  due_on date NOT NULL CHECK(due_on>=prepare_on),
  terms_revision integer NOT NULL,
  state text NOT NULL DEFAULT 'planned' CHECK(state='planned'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,agreement_id,coverage_start,coverage_end),
  FOREIGN KEY(tenant_id,agreement_id,terms_revision) REFERENCES recurring_agreement_versions(tenant_id,agreement_id,terms_revision)
);
CREATE TABLE IF NOT EXISTS recurring_events (
  event_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  agreement_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  FOREIGN KEY(tenant_id,agreement_id) REFERENCES recurring_agreements(tenant_id,agreement_id)
);
CREATE INDEX IF NOT EXISTS recurring_agreements_list ON recurring_agreements(tenant_id,created_at DESC,agreement_id);
CREATE INDEX IF NOT EXISTS recurring_periods_due ON recurring_periods(tenant_id,prepare_on);
CREATE INDEX IF NOT EXISTS recurring_events_history ON recurring_events(tenant_id,agreement_id,occurred_at);

CREATE OR REPLACE FUNCTION recurring_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recurring history is append-only'; END;
$$;
CREATE OR REPLACE FUNCTION recurring_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
   OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
   OR NEW.agreement_number IS DISTINCT FROM OLD.agreement_number OR NEW.created_by IS DISTINCT FROM OLD.created_by
   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Recurring identity is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION recurring_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Also protects inserts outside the application. App serializes on this same row first.
 PERFORM 1 FROM recurring_agreements WHERE tenant_id=NEW.tenant_id AND agreement_id=NEW.agreement_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM recurring_periods p WHERE p.tenant_id=NEW.tenant_id AND p.agreement_id=NEW.agreement_id
  AND p.coverage_start<NEW.coverage_end AND NEW.coverage_start<p.coverage_end
  AND NOT(p.coverage_start=NEW.coverage_start AND p.coverage_end=NEW.coverage_end))
 THEN RAISE EXCEPTION 'Recurring periods overlap'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS recurring_agreement_identity ON recurring_agreements;
CREATE TRIGGER recurring_agreement_identity BEFORE UPDATE ON recurring_agreements FOR EACH ROW EXECUTE FUNCTION recurring_identity_guard();
DROP TRIGGER IF EXISTS recurring_agreement_keep ON recurring_agreements;
CREATE TRIGGER recurring_agreement_keep BEFORE DELETE OR TRUNCATE ON recurring_agreements FOR EACH STATEMENT EXECUTE FUNCTION recurring_immutable();
DROP TRIGGER IF EXISTS recurring_period_overlap ON recurring_periods;
CREATE TRIGGER recurring_period_overlap BEFORE INSERT ON recurring_periods FOR EACH ROW EXECUTE FUNCTION recurring_period_guard();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['recurring_agreement_versions','recurring_periods','recurring_events'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS recurring_history_keep ON %I',name);
  EXECUTE format('CREATE TRIGGER recurring_history_keep BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION recurring_immutable()',name);
 END LOOP;
 FOREACH name IN ARRAY ARRAY['recurring_counters','recurring_agreements','recurring_agreement_versions','recurring_periods','recurring_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('DROP POLICY IF EXISTS recurring_tenant_scope ON %I',name);
  EXECUTE format('CREATE POLICY recurring_tenant_scope ON %I USING (tenant_id=current_setting(''app.recurring_tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''app.recurring_tenant_id'',true))',name);
 END LOOP;
END $$;
WITH seeded AS (
 INSERT INTO tenant_capabilities(tenant_id,capability_key,enabled,updated_by)
 SELECT tenant_id,'recurring_services_pilot',false,'migration:recurring-r1'
 FROM tenants WHERE tenant_id='389b6cc1-2f8d-4fe4-bc3d-f50f92df3157' AND slug='sys' AND active=true
 ON CONFLICT DO NOTHING RETURNING tenant_id,capability_key,enabled,updated_by
)
INSERT INTO tenant_capability_events(event_id,tenant_id,capability_key,previous_enabled,enabled,changed_by)
 SELECT gen_random_uuid()::text,tenant_id,capability_key,NULL,enabled,updated_by FROM seeded;
COMMIT;
