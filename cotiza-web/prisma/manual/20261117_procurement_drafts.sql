-- Internal drafts only. Additive and idempotent; no historical wins are copied.
BEGIN;
CREATE TABLE IF NOT EXISTS procurement_draft_counters (
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  year integer NOT NULL CHECK(year BETWEEN 2000 AND 9999),
  value integer NOT NULL CHECK(value > 0),
  PRIMARY KEY(tenant_id,year)
);
CREATE TABLE IF NOT EXISTS procurement_drafts (
  draft_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  proposal_id text NOT NULL,
  closure_key text NOT NULL CHECK(closure_key ~ '^[a-f0-9]{64}$'),
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  folio text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review_required')),
  review_reason text,
  basis jsonb NOT NULL CHECK(jsonb_typeof(basis)='object'),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  needed_on date,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,proposal_id) REFERENCES proposals(tenant_id,proposal_id),
  UNIQUE(tenant_id,draft_id), UNIQUE(tenant_id,proposal_id,closure_key), UNIQUE(tenant_id,folio)
);
CREATE INDEX IF NOT EXISTS procurement_drafts_tenant_created ON procurement_drafts(tenant_id,created_at DESC,draft_id);
CREATE TABLE IF NOT EXISTS procurement_draft_events (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  draft_id text NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  event_type text NOT NULL CHECK(event_type IN ('prepared','updated','review_required')),
  actor_id text NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,draft_id) REFERENCES procurement_drafts(tenant_id,draft_id),
  UNIQUE(tenant_id,draft_id,revision)
);
CREATE OR REPLACE FUNCTION procurement_preserve_basis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.draft_id,NEW.tenant_id,NEW.proposal_id,NEW.closure_key,NEW.source_hash,NEW.folio,NEW.basis,NEW.created_by,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.draft_id,OLD.tenant_id,OLD.proposal_id,OLD.closure_key,OLD.source_hash,OLD.folio,OLD.basis,OLD.created_by,OLD.created_at)
     OR NEW.revision<>OLD.revision+1 OR (OLD.state='review_required' AND NEW.state<>'review_required') THEN
    RAISE EXCEPTION 'The procurement source and prior review state are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION procurement_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Procurement history must be retained' USING ERRCODE='23514'; END $$;
DROP TRIGGER IF EXISTS procurement_basis_guard ON procurement_drafts;
CREATE TRIGGER procurement_basis_guard BEFORE UPDATE ON procurement_drafts FOR EACH ROW EXECUTE FUNCTION procurement_preserve_basis();
DROP TRIGGER IF EXISTS procurement_retain_rows ON procurement_drafts;
CREATE TRIGGER procurement_retain_rows BEFORE DELETE ON procurement_drafts FOR EACH ROW EXECUTE FUNCTION procurement_reject_history_change();
DROP TRIGGER IF EXISTS procurement_retain_all ON procurement_drafts;
CREATE TRIGGER procurement_retain_all BEFORE TRUNCATE ON procurement_drafts FOR EACH STATEMENT EXECUTE FUNCTION procurement_reject_history_change();
DROP TRIGGER IF EXISTS procurement_events_append_only ON procurement_draft_events;
CREATE TRIGGER procurement_events_append_only BEFORE UPDATE OR DELETE ON procurement_draft_events FOR EACH ROW EXECUTE FUNCTION procurement_reject_history_change();
DROP TRIGGER IF EXISTS procurement_events_retain_all ON procurement_draft_events;
CREATE TRIGGER procurement_events_retain_all BEFORE TRUNCATE ON procurement_draft_events FOR EACH STATEMENT EXECUTE FUNCTION procurement_reject_history_change();
ALTER TABLE procurement_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_draft_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_draft_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS procurement_tenant ON procurement_drafts;
CREATE POLICY procurement_tenant ON procurement_drafts USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
DROP POLICY IF EXISTS procurement_tenant ON procurement_draft_events;
CREATE POLICY procurement_tenant ON procurement_draft_events USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
DROP POLICY IF EXISTS procurement_tenant ON procurement_draft_counters;
CREATE POLICY procurement_tenant ON procurement_draft_counters USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
COMMIT;
