-- One-time, reversible cleanup authorized by Salvador on 2026-10-22.
-- Historical HTTP methods were not recorded: classification is inferred from
-- the paired pattern, not a claim that an individual request was HEAD.
-- Never reuse this rule for new downloads or collapse events in application code.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE proposal_audit_events IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS proposal_audit_events_dedup_archive (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  proposal_id text NOT NULL,
  event_type text NOT NULL,
  event_hash text NOT NULL,
  created_at timestamp(6) NOT NULL,
  payload text,
  retained_event_id text NOT NULL,
  retained_created_at timestamp(6) NOT NULL,
  batch_id text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason text NOT NULL
);

CREATE TEMP TABLE download_dedup_pairs ON COMMIT DROP AS
SELECT a.event_id AS archive_id, k.event_id AS keep_id,
       k.created_at AS keep_created_at
FROM proposal_audit_events a
JOIN proposal_audit_events k
  ON k.tenant_id = a.tenant_id AND k.proposal_id = a.proposal_id
 AND k.event_type = a.event_type AND k.payload::jsonb = a.payload::jsonb
 AND k.created_at > a.created_at
 AND k.created_at <= a.created_at + interval '5 seconds'
WHERE a.event_type = 'document_issued'
  AND a.payload::jsonb->>'via' IN ('pdf', 'xlsx')
  AND a.payload::jsonb->>'forced' = 'false'
  AND coalesce(a.payload::jsonb->>'actorUserId', '') <> ''
  AND NOT (a.payload::jsonb ? 'httpMethod')
  AND k.created_at < timestamp '2026-10-22 13:12:35.736'
  -- Adjacent events only: any intervening decision or action excludes a pair.
  AND NOT EXISTS (
    SELECT 1 FROM proposal_audit_events x
    WHERE x.tenant_id = a.tenant_id AND x.proposal_id = a.proposal_id
      AND x.created_at > a.created_at AND x.created_at < k.created_at
  )
  -- Only isolated pairs; never collapse a chain or group of three downloads.
  AND NOT EXISTS (
    SELECT 1 FROM proposal_audit_events x
    WHERE x.tenant_id = a.tenant_id AND x.proposal_id = a.proposal_id
      AND x.event_type = a.event_type AND x.payload::jsonb = a.payload::jsonb
      AND x.event_id NOT IN (a.event_id, k.event_id)
      AND x.created_at BETWEEN a.created_at - interval '5 seconds'
                           AND k.created_at + interval '5 seconds'
  );

DO $$
DECLARE candidate_count integer; archived_count integer; before_count integer;
        removed_count integer; inserted_count integer;
BEGIN
  SELECT count(*) INTO candidate_count FROM download_dedup_pairs;
  SELECT count(*) INTO archived_count FROM proposal_audit_events_dedup_archive
    WHERE batch_id = 'download-head-dedup-20261022';
  IF candidate_count = 0 AND archived_count = 11 THEN
    RETURN; -- Verified idempotent replay.
  END IF;
  IF candidate_count <> 11 OR archived_count <> 0 THEN
    RAISE EXCEPTION 'Unexpected cleanup scope: % candidates, % archived', candidate_count, archived_count;
  END IF;
  SELECT count(*) INTO before_count FROM proposal_audit_events;

  INSERT INTO proposal_audit_events_dedup_archive
    (event_id, tenant_id, proposal_id, event_type, event_hash, created_at, payload,
     retained_event_id, retained_created_at, batch_id, reason)
  SELECT e.event_id, e.tenant_id, e.proposal_id, e.event_type, e.event_hash,
         e.created_at, e.payload, p.keep_id, p.keep_created_at,
         'download-head-dedup-20261022',
         'User-authorized historical pair cleanup: identical full payload, same tenant/proposal/actor, isolated adjacent pair within 5s, before HEAD fix. HTTP method unknown; original row preserved for recovery.'
  FROM proposal_audit_events e JOIN download_dedup_pairs p ON p.archive_id=e.event_id;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> 11 THEN RAISE EXCEPTION 'Archive count mismatch'; END IF;

  DELETE FROM proposal_audit_events e
  USING download_dedup_pairs p, proposal_audit_events_dedup_archive b
  WHERE e.event_id=p.archive_id AND b.event_id=e.event_id
    AND b.batch_id='download-head-dedup-20261022'
    AND (e.tenant_id,e.proposal_id,e.event_type,e.event_hash,e.created_at,e.payload)
        IS NOT DISTINCT FROM
        (b.tenant_id,b.proposal_id,b.event_type,b.event_hash,b.created_at,b.payload);
  GET DIAGNOSTICS removed_count = ROW_COUNT;
  IF removed_count <> 11 OR (SELECT count(*) FROM proposal_audit_events) <> before_count - 11 THEN
    RAISE EXCEPTION 'Removal count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM download_dedup_pairs p
    LEFT JOIN proposal_audit_events k ON k.event_id=p.keep_id
    WHERE k.event_id IS NULL
  ) THEN RAISE EXCEPTION 'Retained event missing'; END IF;
END $$;
COMMIT;
