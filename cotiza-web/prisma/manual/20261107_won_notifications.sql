-- Apply before deploying the won-event pilot. Does not enable any tenant.
BEGIN;
CREATE TABLE IF NOT EXISTS opportunity_won_notification_policies (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(tenant_id),
 enabled BOOLEAN NOT NULL DEFAULT false,
 include_owner BOOLEAN NOT NULL DEFAULT true,
 designated_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(designated_user_ids)='array'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_audit_won_events_lookup
 ON proposal_audit_events(tenant_id, event_type, created_at DESC);
COMMIT;
-- Rollback after reverting code: DROP TABLE opportunity_won_notification_policies;
-- Keep audit events: they are historical facts, not configuration.
