-- Additive, idempotent. Existing tenants retain consultative mode without a backfill.
-- No channel is enabled by this migration or by an operation mode selection.
BEGIN;
CREATE TABLE IF NOT EXISTS tenant_operation_profiles (
  tenant_id text PRIMARY KEY REFERENCES tenants(tenant_id),
  operation_mode text NOT NULL CHECK (operation_mode IN ('consultative', 'pos', 'mixed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);
CREATE TABLE IF NOT EXISTS tenant_operation_events (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  previous_mode text NOT NULL CHECK (previous_mode IN ('consultative', 'pos', 'mixed')),
  operation_mode text NOT NULL CHECK (operation_mode IN ('consultative', 'pos', 'mixed')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS tenant_operation_events_tenant_changed_idx
  ON tenant_operation_events(tenant_id, changed_at);
COMMIT;
