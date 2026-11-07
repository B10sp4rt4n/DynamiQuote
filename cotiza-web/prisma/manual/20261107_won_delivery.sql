-- Apply after 20261107_won_notifications.sql, before enabling delivery flags.
-- No tenant or transport is enabled by this additive migration.
BEGIN;
CREATE TABLE IF NOT EXISTS won_in_app_notifications (
 notification_id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
 source_event_id TEXT NOT NULL REFERENCES proposal_audit_events(event_id),
 proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
 opportunity_id TEXT NOT NULL,
 recipient_user_id TEXT NOT NULL REFERENCES app_users(user_id),
 reasons JSONB NOT NULL,
 subject TEXT NOT NULL,
 body TEXT NOT NULL,
 link_path TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 read_at TIMESTAMPTZ,
 UNIQUE(source_event_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS won_in_app_recipient ON won_in_app_notifications(tenant_id,recipient_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS won_email_deliveries (
 delivery_id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
 source_event_id TEXT NOT NULL REFERENCES proposal_audit_events(event_id),
 proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
 opportunity_id TEXT NOT NULL,
 normalized_email TEXT NOT NULL,
 recipient_ids JSONB NOT NULL,
 reasons JSONB NOT NULL,
 message JSONB,
 idempotency_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','uncertain','suppressed')),
 attempt_count INTEGER NOT NULL DEFAULT 0,
 first_attempt_at TIMESTAMPTZ,
 lease_token TEXT,
 lease_until TIMESTAMPTZ,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 provider_message_id TEXT,
 last_error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 sent_at TIMESTAMPTZ,
 UNIQUE(source_event_id,normalized_email)
);
CREATE INDEX IF NOT EXISTS won_email_due ON won_email_deliveries(tenant_id,state,next_attempt_at);
CREATE TABLE IF NOT EXISTS won_email_attempts (
 attempt_id TEXT PRIMARY KEY,
 delivery_id TEXT NOT NULL REFERENCES won_email_deliveries(delivery_id),
 attempt_number INTEGER NOT NULL,
 started_at TIMESTAMPTZ NOT NULL,
 finished_at TIMESTAMPTZ,
 state TEXT NOT NULL CHECK(state IN ('sending','sent','failed','uncertain','suppressed')),
 error_code TEXT,
 provider_message_id TEXT,
 UNIQUE(delivery_id,attempt_number)
);
COMMIT;
