-- Additive extension. Apply explicitly before enabling the tenant pilot.
BEGIN;
CREATE TABLE IF NOT EXISTS mercadolibre_connections (
  tenant_id text PRIMARY KEY REFERENCES tenants(tenant_id),
  seller_id text NOT NULL UNIQUE,
  nickname text NOT NULL,
  credentials text,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('connected', 'reconnect_required', 'disconnected')),
  connected_by text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  UNIQUE (tenant_id, seller_id)
);
CREATE TABLE IF NOT EXISTS mercadolibre_oauth_attempts (
  state_hash text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  actor_id text NOT NULL,
  browser_hash text NOT NULL,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS mercadolibre_sales (
  tenant_id text NOT NULL,
  seller_id text NOT NULL,
  order_id text NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  imported_by text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, seller_id, order_id),
  FOREIGN KEY (tenant_id, seller_id) REFERENCES mercadolibre_connections(tenant_id, seller_id)
);
CREATE TABLE IF NOT EXISTS mercadolibre_sale_revisions (
  revision_id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  seller_id text NOT NULL,
  order_id text NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  observed_by text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, seller_id, order_id) REFERENCES mercadolibre_sales(tenant_id, seller_id, order_id)
);
CREATE INDEX IF NOT EXISTS mercadolibre_sales_inbox ON mercadolibre_sales(tenant_id, imported_at DESC, order_id);
CREATE INDEX IF NOT EXISTS mercadolibre_revisions_order ON mercadolibre_sale_revisions(tenant_id, seller_id, order_id, revision_id);
COMMIT;
