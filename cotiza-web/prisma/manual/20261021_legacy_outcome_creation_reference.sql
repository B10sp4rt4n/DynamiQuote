-- Authorized historical reporting rule, cutoff: 2026-10-21 00:00 CDMX.
-- Existing won/lost decisions without an observed close use their original
-- proposal creation date for KPI reporting. Never overwrite outcome_at,
-- created_at, internal approval dates, outcomes, amounts or opportunity clocks.
-- Append one durable, idempotent audit marker per eligible proposal.
BEGIN;
INSERT INTO proposal_audit_events
  (event_id, tenant_id, proposal_id, event_type, event_hash, created_at, payload)
SELECT
  'legacy-creation-20261021:' || p.proposal_id,
  p.tenant_id,
  p.proposal_id,
  'historical_creation_reference',
  md5(p.proposal_id || '|' || p.created_at::text || '|created_at_legacy'),
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
  json_build_object(
    'basis', 'created_at_legacy',
    'referenceAt', to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'outcome', p.outcome,
    'cutoff', '2026-10-21T06:00:00Z',
    'reason', 'Referencia historica por fecha de creacion autorizada por el usuario; no es un cierre observado'
  )::text
FROM proposals p
WHERE p.outcome IN ('won', 'lost')
  AND p.outcome_at IS NULL
  AND p.created_at < TIMESTAMP '2026-10-21 06:00:00'
ON CONFLICT (event_id) DO NOTHING;
COMMIT;
