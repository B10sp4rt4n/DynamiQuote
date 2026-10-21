-- Additive migration. Apply before deploying code that selects outcome_at.
-- Existing outcomes keep NULL: closed_at is an internal approval/status date,
-- not evidence of when the customer decision was recorded.
BEGIN;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS outcome_at timestamp(6);
CREATE INDEX IF NOT EXISTS proposals_tenant_outcome_at_idx
  ON proposals (tenant_id, outcome_at) WHERE outcome IN ('won', 'lost');
COMMIT;
