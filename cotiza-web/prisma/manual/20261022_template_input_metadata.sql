-- Additive foundation; apply before deploying the template input helpers.
BEGIN;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS source_metadata jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS input_metadata jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS idx_packages_source_operation
  ON packages (tenant_id, (source_metadata->>'operationId'))
  WHERE source_metadata->>'operationId' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_input_operation
  ON quotes (tenant_id, (input_metadata->>'operationId'))
  WHERE input_metadata->>'operationId' IS NOT NULL;
COMMIT;
