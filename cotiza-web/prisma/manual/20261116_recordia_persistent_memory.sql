-- Explicit installation. Execute all statements in ONE transaction.
-- Only the already authorized SynAppsSys pilot is enrolled.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.opportunities, public.quotes, public.proposals, public.interaction_logs,
  public.proposal_audit_events, public.proposal_approvals, public.quote_lines,
  public.formal_proposals, public.proposal_items, public.tasks IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.recordia_memory_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL CHECK (tenant_id = '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157'),
  source_table text NOT NULL CHECK (source_table IN ('opportunities','quotes','proposals','interaction_logs','proposal_audit_events','proposal_approvals','quote_lines','formal_proposals','proposal_items','tasks')),
  source_id text NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  event_type text NOT NULL CHECK (event_type IN ('baseline.observed','baseline.reobserved','source.created','source.attached','source.updated','source.deleted','source.detached')),
  case_ids text[] NOT NULL,
  recorded_at timestamptz NOT NULL,
  source_timestamp_raw text,
  actor_id text,
  actor_identity_status text NOT NULL CHECK (actor_identity_status IN ('declared','unknown')),
  recorder_db_role text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  previous_event_id uuid REFERENCES public.recordia_memory_events(event_id),
  previous_hash text NOT NULL CHECK (previous_hash ~ '^[a-f0-9]{64}$'),
  canonical_text text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  UNIQUE (tenant_id, source_table, source_id, source_version),
  CHECK (content_hash = encode(sha256(convert_to(canonical_text, 'UTF8')), 'hex')),
  CHECK ((canonical_text::jsonb)->>'event_id' = event_id::text),
  CHECK ((canonical_text::jsonb)->>'tenant_id' = tenant_id),
  CHECK (((canonical_text::jsonb)->>'source_version')::integer = source_version),
  CHECK ((canonical_text::jsonb)->'before_data' = COALESCE(before_data, 'null'::jsonb)),
  CHECK ((canonical_text::jsonb)->'after_data' = COALESCE(after_data, 'null'::jsonb)),
  CHECK ((source_version = 1) = (previous_event_id IS NULL)),
  CONSTRAINT recordia_envelope_matches CHECK (canonical_text::jsonb = jsonb_build_object(
    'recordia_version','1.0','canonical_format','postgres-jsonb-text-v1','event_id',event_id::text,
    'tenant_id',tenant_id,'source_table',source_table,'source_id',source_id,'source_version',source_version,
    'event_type',event_type,'case_ids',case_ids,
    'recorded_at_utc',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'source_timestamp_raw',source_timestamp_raw,'actor_id',actor_id,'actor_identity_status',actor_identity_status,
    'recorder_db_role',recorder_db_role,'before_data',before_data,'after_data',after_data,
    'previous_event_id',previous_event_id::text,'previous_hash',previous_hash,
    'relation',CASE WHEN previous_event_id IS NULL THEN NULL ELSE 'supersedes' END))
);
CREATE INDEX IF NOT EXISTS recordia_memory_cases_idx ON public.recordia_memory_events USING gin(case_ids);
CREATE INDEX IF NOT EXISTS recordia_memory_recorded_idx ON public.recordia_memory_events(tenant_id, event_number DESC);

CREATE OR REPLACE FUNCTION public.recordia_reject_memory_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Recordia history is append-only; append a new version instead' USING ERRCODE = '55000';
END;
$$;
CREATE OR REPLACE TRIGGER recordia_memory_no_update_delete
  BEFORE UPDATE OR DELETE ON public.recordia_memory_events
  FOR EACH ROW EXECUTE FUNCTION public.recordia_reject_memory_mutation();
CREATE OR REPLACE TRIGGER recordia_memory_no_truncate
  BEFORE TRUNCATE ON public.recordia_memory_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.recordia_reject_memory_mutation();
ALTER TABLE public.recordia_memory_events ENABLE ALWAYS TRIGGER recordia_memory_no_update_delete;
ALTER TABLE public.recordia_memory_events ENABLE ALWAYS TRIGGER recordia_memory_no_truncate;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.recordia_memory_events FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.recordia_source_tenant(p_table text, p_row jsonb) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE result text;
BEGIN
  IF p_row IS NULL THEN RETURN NULL; END IF;
  IF p_table = 'quote_lines' THEN
    SELECT tenant_id INTO result FROM public.quotes WHERE quote_id = p_row->>'quote_id';
    RETURN result;
  END IF;
  RETURN p_row->>'tenant_id';
END;
$$;

CREATE OR REPLACE FUNCTION public.recordia_source_cases(p_table text, p_row jsonb) RETURNS text[]
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE case_id text; proposal_json jsonb;
BEGIN
  IF p_row IS NULL THEN RETURN ARRAY[]::text[]; END IF;
  IF p_table = 'opportunities' THEN case_id := p_row->>'opportunity_id';
  ELSIF p_table IN ('quotes','interaction_logs','tasks') THEN case_id := p_row->>'opportunity_id';
  ELSIF p_table = 'quote_lines' THEN
    SELECT opportunity_id INTO case_id FROM public.quotes
      WHERE quote_id = p_row->>'quote_id' AND tenant_id = '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157';
  ELSIF p_table = 'proposals' THEN
    case_id := p_row->>'opportunity_id';
    IF case_id IS NULL THEN
      SELECT opportunity_id INTO case_id FROM public.quotes WHERE quote_id = p_row->>'origin'
        AND tenant_id = '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157';
    END IF;
  ELSE
    SELECT to_jsonb(p) INTO proposal_json FROM public.proposals p
      WHERE proposal_id = p_row->>'proposal_id' AND tenant_id = '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157';
    IF proposal_json IS NOT NULL THEN
      RETURN public.recordia_source_cases('proposals', proposal_json);
    ELSIF p_table = 'formal_proposals' THEN
      SELECT opportunity_id INTO case_id FROM public.quotes WHERE quote_id = p_row->>'quote_id'
        AND tenant_id = '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157';
    END IF;
  END IF;
  IF case_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.opportunities o WHERE o.opportunity_id=case_id
      AND o.tenant_id='389b6cc1-2f8d-4fe4-bc3d-f50f92df3157') OR EXISTS(
      SELECT 1 FROM public.recordia_memory_events e WHERE e.source_table='opportunities'
        AND e.source_id=case_id AND e.tenant_id='389b6cc1-2f8d-4fe4-bc3d-f50f92df3157')) THEN
    RETURN ARRAY[case_id];
  END IF;
  RETURN ARRAY[]::text[];
END;
$$;

CREATE OR REPLACE FUNCTION public.recordia_structured_snapshot(p_row jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE result jsonb; fingerprints jsonb := '{}'::jsonb; k text;
BEGIN
  IF p_row IS NULL THEN RETURN NULL; END IF;
  result := p_row - ARRAY['pdf_file_data','signature_image_data','invoice_xml_base64'];
  FOREACH k IN ARRAY ARRAY['pdf_file_data','signature_image_data','invoice_xml_base64'] LOOP
    IF p_row->>k IS NOT NULL THEN
      fingerprints := fingerprints || jsonb_build_object(k,
        jsonb_build_object('sha256_utf8_field', encode(sha256(convert_to(p_row->>k,'UTF8')),'hex'),
          'preserved', false));
    END IF;
  END LOOP;
  RETURN result || jsonb_build_object('_recordia_omitted_fields', fingerprints);
END;
$$;

CREATE OR REPLACE FUNCTION public.recordia_append_source(p_table text, p_id text, p_before jsonb, p_after jsonb,
  p_event_type text, p_cases text[], p_source_time text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE prior public.recordia_memory_events%ROWTYPE; eid uuid := gen_random_uuid();
  recorded timestamptz := clock_timestamp(); v integer; previous text;
  actor text := NULLIF(current_setting('app.recordia_actor_id',true),'');
  canonical text; scoped_cases text[];
BEGIN
  IF p_table NOT IN ('opportunities','quotes','proposals','interaction_logs','proposal_audit_events',
      'proposal_approvals','quote_lines','formal_proposals','proposal_items','tasks') THEN
    RAISE EXCEPTION 'Unsupported Recordia source';
  END IF;
  -- Independent per-object chains: no global lock serializes unrelated business objects/tenants.
  PERFORM pg_advisory_xact_lock(hashtextextended('recordia:' || p_table || ':' || p_id, 0));
  SELECT * INTO prior FROM public.recordia_memory_events
    WHERE tenant_id='389b6cc1-2f8d-4fe4-bc3d-f50f92df3157' AND source_table=p_table AND source_id=p_id
    ORDER BY source_version DESC LIMIT 1;
  IF p_event_type='baseline.observed' AND prior.event_id IS NOT NULL THEN
    IF prior.after_data IS NOT DISTINCT FROM p_after THEN RETURN prior.event_id; END IF;
    -- A changed state observed after a capture gap is NOT an invented historical update.
    p_event_type := 'baseline.reobserved'; p_before := prior.after_data;
  END IF;
  IF p_event_type='source.updated' AND p_before IS NOT DISTINCT FROM p_after THEN RETURN prior.event_id; END IF;
  v := COALESCE(prior.source_version,0)+1;
  previous := COALESCE(prior.content_hash, repeat('0',64));
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::text[]) INTO scoped_cases
    FROM unnest(COALESCE(p_cases,ARRAY[]::text[]) || COALESCE(prior.case_ids,ARRAY[]::text[])) x;
  -- A creator/approver declaration can identify an INSERT; never attribute UPDATE/DELETE to that creator.
  IF actor IS NULL AND p_event_type='source.created' THEN
    actor := COALESCE(NULLIF(p_after->>'created_by_user_id',''),
      CASE WHEN p_table='proposal_approvals' THEN NULLIF(p_after->>'approver_user_id','') ELSE NULL END);
  END IF;
  -- A baseline's recorder is the migration, not the historical row creator.
  IF p_event_type LIKE 'baseline.%' THEN actor := NULL; END IF;
  canonical := jsonb_build_object('recordia_version','1.0','canonical_format','postgres-jsonb-text-v1',
    'event_id',eid::text,'tenant_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157',
    'source_table',p_table,'source_id',p_id,'source_version',v,'event_type',p_event_type,
    'case_ids',scoped_cases,'recorded_at_utc',to_char(recorded AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'source_timestamp_raw',p_source_time,'actor_id',actor,'actor_identity_status',CASE WHEN actor IS NULL THEN 'unknown' ELSE 'declared' END,
    'recorder_db_role',session_user,'before_data',p_before,'after_data',p_after,
    'previous_event_id',prior.event_id::text,'previous_hash',previous,
    'relation',CASE WHEN prior.event_id IS NULL THEN NULL ELSE 'supersedes' END)::text;
  INSERT INTO public.recordia_memory_events(event_id,tenant_id,source_table,source_id,source_version,event_type,case_ids,
    recorded_at,source_timestamp_raw,actor_id,actor_identity_status,recorder_db_role,before_data,after_data,
    previous_event_id,previous_hash,canonical_text,content_hash)
  VALUES(eid,'389b6cc1-2f8d-4fe4-bc3d-f50f92df3157',p_table,p_id,v,p_event_type,scoped_cases,
    recorded,p_source_time,actor,CASE WHEN actor IS NULL THEN 'unknown' ELSE 'declared' END,session_user,p_before,p_after,
    prior.event_id,previous,canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'));
  RETURN eid;
END;
$$;
REVOKE ALL ON FUNCTION public.recordia_append_source(text,text,jsonb,jsonb,text,text[],text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.recordia_capture_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE before_row jsonb; after_row jsonb; old_tenant text; new_tenant text;
  sid text; eid uuid; kind text; cases text[]; source_time text;
BEGIN
  IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;
  old_tenant := public.recordia_source_tenant(TG_TABLE_NAME,before_row);
  new_tenant := public.recordia_source_tenant(TG_TABLE_NAME,after_row);
  IF old_tenant IS DISTINCT FROM '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157' THEN before_row := NULL; END IF;
  IF new_tenant IS DISTINCT FROM '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157' THEN after_row := NULL; END IF;
  IF before_row IS NULL AND after_row IS NULL THEN RETURN NULL; END IF;
  -- Primary-key changes cannot silently join two identities in the historical chain.
  IF before_row IS NOT NULL AND after_row IS NOT NULL AND before_row->>TG_ARGV[0] IS DISTINCT FROM after_row->>TG_ARGV[0] THEN
    RAISE EXCEPTION 'Recordia source identity cannot be rewritten';
  END IF;
  sid := COALESCE(after_row,before_row)->>TG_ARGV[0];
  cases := public.recordia_source_cases(TG_TABLE_NAME,before_row) || public.recordia_source_cases(TG_TABLE_NAME,after_row);
  source_time := COALESCE(after_row,before_row)->>'updated_at';
  IF source_time IS NULL THEN source_time := COALESCE(after_row,before_row)->>'created_at'; END IF;
  kind := CASE WHEN TG_OP='DELETE' THEN 'source.deleted' WHEN after_row IS NULL THEN 'source.detached'
    WHEN TG_OP='INSERT' THEN 'source.created' WHEN before_row IS NULL THEN 'source.attached' ELSE 'source.updated' END;
  eid := public.recordia_append_source(TG_TABLE_NAME,sid,public.recordia_structured_snapshot(before_row),
    public.recordia_structured_snapshot(after_row),kind,cases,source_time);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.recordia_capture_source() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.recordia_guard_source_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE enrolled_rows boolean;
BEGIN
  IF TG_TABLE_NAME='quote_lines' THEN
    SELECT EXISTS(SELECT 1 FROM public.quote_lines l JOIN public.quotes q USING(quote_id)
      WHERE q.tenant_id='389b6cc1-2f8d-4fe4-bc3d-f50f92df3157') INTO enrolled_rows;
  ELSE
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE tenant_id=$1)',TG_TABLE_NAME)
      INTO enrolled_rows USING '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157';
  END IF;
  IF enrolled_rows THEN RAISE EXCEPTION 'Recordia requires row-level deletion capture; TRUNCATE blocked' USING ERRCODE='55000'; END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE s record; r record; j jsonb; source_query text;
BEGIN
  -- Parent sources precede children, so legacy archived relationships can be resolved.
  FOR s IN SELECT * FROM (VALUES (1,'opportunities','opportunity_id'),(2,'quotes','quote_id'),
    (3,'proposals','proposal_id'),(4,'interaction_logs','interaction_id'),(5,'proposal_audit_events','event_id'),
    (6,'proposal_approvals','approval_id'),(7,'quote_lines','line_id'),(8,'formal_proposals','proposal_doc_id'),
    (9,'proposal_items','item_id'),(10,'tasks','task_id')) AS sources(n,t,k) ORDER BY n LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER recordia_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.recordia_capture_source(%L)',s.t,s.k);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER recordia_capture',s.t);
    EXECUTE format('CREATE OR REPLACE TRIGGER recordia_guard_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.recordia_guard_source_truncate()',s.t);
    source_query := CASE WHEN s.t='quote_lines' THEN
      'SELECT to_jsonb(x) AS image FROM public.quote_lines x JOIN public.quotes q USING(quote_id) WHERE q.tenant_id=$1 ORDER BY x.line_id'
      ELSE format('SELECT to_jsonb(x) AS image FROM public.%I x WHERE tenant_id=$1 ORDER BY %I',s.t,s.k) END;
    FOR r IN EXECUTE source_query USING '389b6cc1-2f8d-4fe4-bc3d-f50f92df3157' LOOP
      j := r.image;
      IF public.recordia_source_tenant(s.t,j)='389b6cc1-2f8d-4fe4-bc3d-f50f92df3157' THEN
        PERFORM public.recordia_append_source(s.t,j->>s.k,NULL,public.recordia_structured_snapshot(j),
          'baseline.observed',public.recordia_source_cases(s.t,j),j->>'created_at');
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
