-- Explicit, additive activation for the authorized SynAppsSys pilot only.
-- No schema change, billing action, business-data change, or other tenant activation.
-- Reruns preserve an operator's later revocation.
WITH activated AS (
  INSERT INTO tenant_capabilities (tenant_id, capability_key, enabled, updated_by)
  SELECT tenant_id, 'recordia_mcp_premium', true, 'pilot:20261116:authorized-by-salvador'
  FROM tenants WHERE tenant_id = '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157'
    AND slug = 'sys' AND active = true
  ON CONFLICT DO NOTHING
  RETURNING tenant_id, capability_key, enabled, updated_by
)
INSERT INTO tenant_capability_events (event_id, tenant_id, capability_key, previous_enabled, enabled, changed_by)
SELECT gen_random_uuid()::text, tenant_id, capability_key, NULL, enabled, updated_by FROM activated;
