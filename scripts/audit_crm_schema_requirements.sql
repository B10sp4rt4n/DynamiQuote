-- Supplemental READ-ONLY prerequisite check. Run before data preflight/migration.
-- Checks critical operational columns, NOT the entire schema or data readiness.
-- Missing/type mismatches STOP the cutover; this file repairs nothing.
BEGIN TRANSACTION READ ONLY;
WITH required(table_name, column_name, expected_type) AS (
  VALUES
    ('proposal_approvals', 'executed_by_user_id', 'text'),
    ('proposals', 'created_by_user_id', 'text'),
    ('proposals', 'outcome_at', 'timestamp without time zone'),
    ('proposals', 'opportunity_id', 'text'),
    ('proposals', 'invoice_draft_id', 'text'),
    ('proposals', 'invoice_uuid', 'text'),
    ('proposals', 'invoice_status', 'text'),
    ('proposals', 'invoice_stamped_at', 'timestamp without time zone'),
    ('proposals', 'invoice_xml_base64', 'text'),
    ('packages', 'source_metadata', 'jsonb'),
    ('quotes', 'input_metadata', 'jsonb'),
    ('tenant_capabilities', 'tenant_id', 'text'),
    ('tenant_capabilities', 'capability_key', 'text'),
    ('tenant_capabilities', 'enabled', 'boolean'),
    ('tenant_capability_events', 'event_id', 'text'),
    ('tenant_capability_events', 'changed_by', 'text')
), checked AS (
  SELECT r.*, c.data_type AS actual_type,
    CASE WHEN c.column_name IS NULL THEN 'missing'
      WHEN c.data_type <> r.expected_type THEN 'wrong_type'
      ELSE 'present' END AS state
  FROM required r LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = r.column_name
)
SELECT jsonb_build_object(
  'profile', 'cotiza-critical-schema/0.1',
  'scope', 'critical_columns_only',
  'required_count', count(*),
  'missing_count', count(*) FILTER (WHERE state = 'missing'),
  'wrong_type_count', count(*) FILTER (WHERE state = 'wrong_type'),
  'checks', jsonb_agg(jsonb_build_object(
    'table', table_name, 'column', column_name, 'expected_type', expected_type,
    'actual_type', actual_type, 'state', state
  ) ORDER BY table_name, column_name)
) AS crm_schema_readiness FROM checked;
COMMIT;
