-- Additive migration. Missing capabilities remain disabled. Reruns preserve admin choices.
CREATE TABLE IF NOT EXISTS tenant_capabilities (
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  capability_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  PRIMARY KEY (tenant_id, capability_key)
);
CREATE TABLE IF NOT EXISTS tenant_capability_events (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  capability_key text NOT NULL,
  previous_enabled boolean,
  enabled boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS tenant_capability_events_tenant_id_changed_at_idx
  ON tenant_capability_events(tenant_id, changed_at);
WITH seeded AS (
  INSERT INTO tenant_capabilities (tenant_id, capability_key, enabled, updated_by)
  SELECT tenant_id, 'threatdown_pdf_import', true, 'migration:20261022_tenant_capabilities'
  FROM tenants WHERE tenant_id = '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157' AND active = true
  ON CONFLICT DO NOTHING RETURNING tenant_id, capability_key, enabled, updated_by
)
INSERT INTO tenant_capability_events (event_id, tenant_id, capability_key, previous_enabled, enabled, changed_by)
SELECT gen_random_uuid()::text, tenant_id, capability_key, NULL, enabled, updated_by FROM seeded;
