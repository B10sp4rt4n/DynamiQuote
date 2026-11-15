-- Additive, opt-in Gmail pilot. No changes to commercial or fiscal records.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS gmail_clients_tenant_key ON clients(tenant_id,client_id);
CREATE UNIQUE INDEX IF NOT EXISTS gmail_opportunities_client_key ON opportunities(tenant_id,client_id,opportunity_id);
CREATE TABLE IF NOT EXISTS gmail_connections (
  tenant_id text NOT NULL REFERENCES tenants(tenant_id), actor_id text NOT NULL REFERENCES app_users(user_id),
  email_address text NOT NULL UNIQUE CHECK(email_address=lower(email_address)), oauth_client_id text NOT NULL,
  credentials text, expires_at timestamptz NOT NULL, status text NOT NULL CHECK(status IN ('connected','disconnected')),
  connected_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,actor_id),
  UNIQUE(tenant_id,actor_id,email_address)
);
CREATE TABLE IF NOT EXISTS gmail_oauth_attempts (
  state_hash text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(tenant_id), actor_id text NOT NULL REFERENCES app_users(user_id),
  browser_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  consumed_at timestamptz, revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS gmail_oauth_actor_time ON gmail_oauth_attempts(tenant_id,actor_id,created_at);
CREATE TABLE IF NOT EXISTS gmail_message_copies (
  copy_id text PRIMARY KEY, tenant_id text NOT NULL, actor_id text NOT NULL, email_address text NOT NULL,
  message_id text NOT NULL, snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  encrypted_archive text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,actor_id,email_address) REFERENCES gmail_connections(tenant_id,actor_id,email_address),
  UNIQUE(tenant_id,actor_id,email_address,message_id,snapshot_hash), UNIQUE(tenant_id,actor_id,copy_id)
);
CREATE TABLE IF NOT EXISTS gmail_opportunity_links (
  link_id text PRIMARY KEY, tenant_id text NOT NULL, actor_id text NOT NULL, client_id text NOT NULL,
  opportunity_id text NOT NULL, copy_id text NOT NULL, linked_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,client_id) REFERENCES clients(tenant_id,client_id),
  FOREIGN KEY(tenant_id,client_id,opportunity_id) REFERENCES opportunities(tenant_id,client_id,opportunity_id),
  FOREIGN KEY(tenant_id,actor_id,copy_id) REFERENCES gmail_message_copies(tenant_id,actor_id,copy_id),
  UNIQUE(tenant_id,actor_id,opportunity_id,copy_id)
);
CREATE TABLE IF NOT EXISTS gmail_link_events (
  event_id text PRIMARY KEY, link_id text NOT NULL REFERENCES gmail_opportunity_links(link_id),
  actor_id text NOT NULL REFERENCES app_users(user_id), event_type text NOT NULL CHECK(event_type='message_linked'),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
