BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS approval_email_users_tenant_key ON app_users(tenant_id,user_id);
CREATE TABLE IF NOT EXISTS approval_email_outbox (
  notification_key text PRIMARY KEY,
  tenant_id text NOT NULL,
  proposal_id text NOT NULL,
  recipient_id text NOT NULL,
  recipient_email text NOT NULL,
  request_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('internal','consolidation')),
  subject text NOT NULL,
  body text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed','unknown','cancelled')),
  provider_id text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz,
  sent_at timestamptz,
  FOREIGN KEY (tenant_id,proposal_id) REFERENCES proposals(tenant_id,proposal_id),
  FOREIGN KEY (tenant_id,recipient_id) REFERENCES app_users(tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS approval_email_outbox_dossier ON approval_email_outbox(tenant_id,proposal_id,created_at DESC);
COMMIT;
