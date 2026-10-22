-- Optional rollback. Keep the archive as provenance even after restoration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE proposal_audit_events IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO proposal_audit_events
  (event_id, tenant_id, proposal_id, event_type, event_hash, created_at, payload)
SELECT event_id, tenant_id, proposal_id, event_type, event_hash, created_at, payload
FROM proposal_audit_events_dedup_archive
WHERE batch_id='download-head-dedup-20261022'
ON CONFLICT (event_id) DO NOTHING;
-- Do not accept conflicting rows as a successful restore.
DO $$ BEGIN
  IF (SELECT count(*) FROM proposal_audit_events_dedup_archive
      WHERE batch_id='download-head-dedup-20261022') <> 11 OR EXISTS (
    SELECT 1 FROM proposal_audit_events_dedup_archive b
    LEFT JOIN proposal_audit_events e ON e.event_id=b.event_id
    WHERE b.batch_id='download-head-dedup-20261022'
      AND (e.tenant_id,e.proposal_id,e.event_type,e.event_hash,e.created_at,e.payload)
          IS DISTINCT FROM
          (b.tenant_id,b.proposal_id,b.event_type,b.event_hash,b.created_at,b.payload)
  ) THEN RAISE EXCEPTION 'Archive restoration mismatch'; END IF;
END $$;
COMMIT;
