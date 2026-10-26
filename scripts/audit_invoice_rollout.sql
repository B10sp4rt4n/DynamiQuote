-- Read-only rollout audit. Counts only; never changes historical fiscal evidence.
SELECT jsonb_build_object(
  'columns', (SELECT jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) ORDER BY column_name)
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name LIKE 'invoice_%'),
  'status_check_constraints', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid))), '[]'::jsonb)
    FROM pg_constraint WHERE conrelid = 'public.proposals'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%invoice_%'),
  'state_counts', (SELECT jsonb_agg(jsonb_build_object('status', invoice_status, 'count', n))
    FROM (SELECT invoice_status, count(*) AS n FROM proposals GROUP BY invoice_status ORDER BY invoice_status NULLS FIRST) s),
  'unknown_status_count', (SELECT count(*) FROM proposals WHERE invoice_status IS NOT NULL AND invoice_status NOT IN ('draft','stamping','stamped','rejected')),
  'pending_stamping_count', (SELECT count(*) FROM proposals WHERE invoice_status = 'stamping'),
  'evidence_without_stamped_status', (SELECT count(*) FROM proposals WHERE invoice_status IS DISTINCT FROM 'stamped'
    AND (invoice_uuid IS NOT NULL OR invoice_xml_base64 IS NOT NULL OR invoice_stamped_at IS NOT NULL)),
  'stamped_missing_uuid_or_xml', (SELECT count(*) FROM proposals WHERE invoice_status = 'stamped'
    AND (NULLIF(btrim(invoice_uuid), '') IS NULL OR NULLIF(btrim(invoice_xml_base64), '') IS NULL))
) AS invoice_readiness;
