-- Explicit additive migration; requires PostgreSQL 15+ (NULLS NOT DISTINCT).
-- Apply before enabling COTIZA_LOOM_ENABLED and the tenant capability.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS loom_clients_tenant_key ON clients(tenant_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS loom_opportunities_client_key ON opportunities(tenant_id, client_id, opportunity_id);
CREATE TABLE IF NOT EXISTS loom_recording_links (
  link_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  actor_id text NOT NULL REFERENCES app_users(user_id),
  connection_key text NOT NULL CHECK (connection_key ~ '^[a-f0-9]{64}$'),
  client_id text NOT NULL,
  opportunity_id text,
  source_id text NOT NULL CHECK (source_id ~ '^[a-f0-9]{32}$'),
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  revision integer NOT NULL CHECK (revision > 0),
  imported_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, client_id) REFERENCES clients(tenant_id, client_id),
  FOREIGN KEY (tenant_id, client_id, opportunity_id) REFERENCES opportunities(tenant_id, client_id, opportunity_id),
  UNIQUE NULLS NOT DISTINCT (tenant_id, actor_id, connection_key, client_id, opportunity_id, source_id)
);
CREATE TABLE IF NOT EXISTS loom_recording_versions (
  link_id text NOT NULL REFERENCES loom_recording_links(link_id),
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, revision)
);
CREATE INDEX IF NOT EXISTS loom_recordings_dossier
  ON loom_recording_links(tenant_id, actor_id, connection_key, client_id, imported_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS loom_recordings_actor_key ON loom_recording_links(tenant_id, actor_id, link_id);
CREATE TABLE IF NOT EXISTS loom_followup_receipts (
  draft_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  link_id text NOT NULL,
  revision integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('note','task')),
  result_id text NOT NULL,
  source_excerpt text NOT NULL,
  description text NOT NULL,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_id, link_id) REFERENCES loom_recording_links(tenant_id, actor_id, link_id),
  FOREIGN KEY (link_id, revision) REFERENCES loom_recording_versions(link_id, revision),
  CHECK ((kind='note' AND due_date IS NULL) OR (kind='task' AND due_date IS NOT NULL))
);
COMMIT;
