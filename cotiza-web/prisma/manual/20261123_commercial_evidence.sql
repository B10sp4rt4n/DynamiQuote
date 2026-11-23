BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_tenant_quote_commercial_evidence_idx
  ON quotes (tenant_id, quote_id);

CREATE TABLE IF NOT EXISTS commercial_evidence (
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  evidence_id uuid NOT NULL DEFAULT gen_random_uuid(),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  filename text NOT NULL,
  supplier text NOT NULL,
  reference text,
  expires_on date,
  file_data bytea NOT NULL CHECK (octet_length(file_data) BETWEEN 1 AND 3145728),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, evidence_id),
  UNIQUE (tenant_id, sha256)
);

CREATE TABLE IF NOT EXISTS commercial_evidence_quotes (
  tenant_id text NOT NULL,
  quote_id text NOT NULL,
  evidence_id uuid NOT NULL,
  linked_by text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, quote_id, evidence_id),
  FOREIGN KEY (tenant_id, quote_id) REFERENCES quotes(tenant_id, quote_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, evidence_id) REFERENCES commercial_evidence(tenant_id, evidence_id) ON DELETE CASCADE
);

WITH seeded AS (
  INSERT INTO tenant_capabilities (tenant_id, capability_key, enabled, updated_by)
  SELECT tenant_id, 'commercial_evidence', true, 'migration:20261123_commercial_evidence'
  FROM tenants WHERE tenant_id = '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157' AND active = true
  ON CONFLICT DO NOTHING RETURNING tenant_id, capability_key, enabled, updated_by
)
INSERT INTO tenant_capability_events (event_id, tenant_id, capability_key, previous_enabled, enabled, changed_by)
SELECT gen_random_uuid()::text, tenant_id, capability_key, NULL, enabled, updated_by FROM seeded;

COMMIT;
