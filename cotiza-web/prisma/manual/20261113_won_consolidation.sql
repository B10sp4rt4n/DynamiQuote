-- Additive and idempotent. No historical outcomes are changed.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS win_proposals_tenant_key ON proposals(tenant_id, proposal_id);
CREATE TABLE IF NOT EXISTS win_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(tenant_id),
  revision integer NOT NULL CHECK (revision > 0),
  policy jsonb NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS win_policy_events (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  revision integer NOT NULL,
  policy jsonb NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, revision)
);
CREATE TABLE IF NOT EXISTS win_cases (
  tenant_id text NOT NULL,
  proposal_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL,
  PRIMARY KEY (tenant_id, proposal_id),
  FOREIGN KEY (tenant_id, proposal_id) REFERENCES proposals(tenant_id, proposal_id)
);
COMMIT;
