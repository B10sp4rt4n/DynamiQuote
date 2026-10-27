-- Additive, nullable, no historical backfill. Apply before publishing this feature.
BEGIN;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS intake_metadata jsonb;
COMMIT;
