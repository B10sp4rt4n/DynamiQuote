"""Offline contract oracle, NOT a Cotiza adapter, exporter or production service.

Inputs are fictional source assertions; authorization is a trusted test argument.
No network, environment variables, database imports or LLM calls.
"""
import hashlib
import copy
import json
import re
from collections import defaultdict
from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from zoneinfo import ZoneInfo

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[2]
REQUEST = json.loads((ROOT / 'contracts/conversational-client-ranking.request.schema.json').read_text())
RESPONSE = json.loads((ROOT / 'contracts/conversational-client-ranking.response.schema.json').read_text())
REGISTRY = Registry().with_resource('urn:cotiza:conversational-client-ranking:request:0.1', Resource.from_contents(REQUEST))
FORMATS = FormatChecker()


@FORMATS.checks('date-time', raises=(ValueError, TypeError))
def valid_utc_timestamp(value):
    # jsonschema's optional date-time dependency may be absent: never silently skip it.
    if not isinstance(value, str): return True
    return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z', value)) and datetime.fromisoformat(value.replace('Z', '+00:00')) is not None


REQUEST_VALIDATOR = Draft202012Validator(REQUEST, format_checker=FORMATS)
RESPONSE_VALIDATOR = Draft202012Validator(RESPONSE, registry=REGISTRY, format_checker=FORMATS)
ZERO = Decimal('0.00')


def canonical(value):
    """Profile permits JSON strings/bools/null/integers; no floats, normalized text untouched."""
    def check(v):
        if isinstance(v, float):
            raise ValueError('Binary floating point is not canonical in this profile')
        if isinstance(v, dict):
            for item in v.values():
                check(item)
        elif isinstance(v, list):
            for item in v:
                check(item)
    check(value)
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def sha(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timezone required')
    return result


def money(value):
    value = Decimal(value).quantize(Decimal('0.01'))
    return '0.00' if value == 0 else format(value, '.2f')


def pct(value):
    value = value.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
    return '0.000000' if value == 0 else format(value, '.6f')


def issue(code):
    return {'code': code, 'retryable': code in {'STALE_SNAPSHOT', 'INCOMPLETE_SNAPSHOT'}}


def evaluate(request, source, context, now='2026-10-25T18:00:00Z'):
    """Source supplies the financial version selection; the agent NEVER chooses latest."""
    required = {'ranking.read', 'revenue.read', 'evidence.read'}
    if request.get('metric') == 'won_gross_profit':
        required.add('gross_profit.read')
    allowed = (context['enabled'] and context['active'] and
               context.get('tenant_ref') and required <= set(context['permissions']) and
               instant(context['valid_until']) > instant(now))
    scope = {k: context[k] for k in ('tenant_ref', 'principal_ref', 'mode', 'seller_refs')} if allowed else None
    if allowed and scope['mode'] == 'seller' and scope['seller_refs'] != [scope['principal_ref']]:
        allowed, scope = False, None
    authorization = {
        'decision': 'allowed' if allowed else 'denied', 'decision_ref': 'auth:fixture',
        'policy_version': 'fixture-auth/0.1', 'evaluated_at': now, 'valid_until': context['valid_until'],
        'effective_scope': scope, 'capabilities': ['commercial_chat_read'] if allowed else [],
        'permissions': sorted(context['permissions']) if allowed else [],
        'scope_fingerprint': sha(scope) if allowed else None, 'revalidate_on_access': True,
    }
    response = {
        'schema_version': '0.1', 'operation': 'client_ranking', 'metric_version': 'cotiza-client-ranking/0.1',
        'request_id': 'request:fixture', 'response_id': 'response:fixture', 'status': 'forbidden',
        'query': None, 'generated_at': now, 'authorization': authorization,
        'snapshot': None, 'freshness': None, 'coverage': None, 'result': None,
        'financial_rule': None, 'evidence': [], 'errors': [], 'warnings': [],
        'trace': {'audit_ref': 'audit:fixture', 'request_sha256': sha(request),
                  'cache_policy': 'private_revalidate', 'provenance': 'synthetic', 'custody': 'local_only'},
    }
    if not allowed:
        response['errors'] = [issue('FORBIDDEN')]
        return response

    def fail(code):
        response.update(status='insufficient_evidence', result=None, evidence=[], errors=[issue(code)])
        return response

    if list(REQUEST_VALIDATOR.iter_errors(request)):
        return fail('INVALID_REQUEST')
    if request['period']['start_date'] >= request['period']['end_date_exclusive']:
        return fail('INVALID_REQUEST')
    response['query'] = copy.deepcopy(request)
    if request['currency'] not in ('MXN', 'USD'):
        return fail('UNSUPPORTED_CURRENCY')

    # Projection precedes counters, hashes, version checks and aggregation.
    def visible(record):
        return record['tenant_ref'] == scope['tenant_ref'] and (
            scope['mode'] == 'tenant' or record['seller_ref'] in scope['seller_refs'])
    records = [r for r in source['records'] if visible(r)]
    selected = [r for r in source['selection'] if visible(r)]
    can_read_profit = 'gross_profit.read' in context['permissions']
    if not can_read_profit:
        records = [dict(r, cost_decimal=None) for r in records]
    scoped_payload = {**{k: source[k] for k in ('as_of', 'exported_at', 'data_until', 'period_complete')},
                      'records': records, 'selection': selected, 'scope': scope}
    age = int((instant(now) - instant(source['as_of'])).total_seconds())
    if age < 0 or instant(source['data_until']) > instant(source['as_of']) or instant(source['exported_at']) < instant(source['as_of']) or instant(source['exported_at']) > instant(now):
        return fail('FUTURE_SNAPSHOT')
    response['snapshot'] = {
        'snapshot_id': 'snapshot:fictional', 'snapshot_contract_version': 'ranking-fixture/0.1',
        'source_system': 'cotiza', 'source_schema_version': 'fictional-commercial/0.1',
        'source_revision': source['revision'], 'as_of': source['as_of'], 'exported_at': source['exported_at'],
        'data_until': source['data_until'], 'scope_fingerprint': sha(scope),
        'source_attestation_ref': 'attestation:fixture-not-authenticated',
        'integrity': {'canonicalization': 'sorted-json-utf8/v1', 'sha256': sha(scoped_payload), 'assurance': 'integrity_only'},
    }
    stale = age > context['max_age_seconds']
    response['freshness'] = {'state': 'stale' if stale else 'fresh', 'age_seconds': age, 'max_age_seconds': context['max_age_seconds']}
    response['financial_rule'] = {'authority': 'cotiza', 'rule_id': 'fixture-financial', 'version': '0.1',
                                  'selection_rule_ref': 'selection:source-asserted', 'amount_basis': 'official_before_vat', 'fx_policy': 'none'}
    if source.get('integrity_valid') is False:
        return fail('INTEGRITY_FAILURE')
    # Every sale has exactly ONE source-selected version, including independent sales.
    keys = [(r['sale_ref'], r['proposal_ref'], r['version']) for r in records]
    if len(keys) != len(set(keys)) or len({s['sale_ref'] for s in selected}) != len(selected) or {s['sale_ref'] for s in selected} != {r['sale_ref'] for r in records}:
        return fail('VERSION_SELECTION_INVALID')
    chosen = []
    for selection in selected:
        matches = [r for r in records if all(r[k] == selection[k] for k in ('sale_ref', 'proposal_ref', 'version'))]
        if len(matches) != 1 or instant(matches[0]['recorded_at']) > instant(source['as_of']):
            return fail('VERSION_SELECTION_INVALID')
        chosen.append(matches[0])
    zone = ZoneInfo(request['period']['timezone'])
    start, end = [datetime.combine(date.fromisoformat(request['period'][k]), time.min, zone) for k in ('start_date', 'end_date_exclusive')]
    complete = source['period_complete'] and instant(source['data_until']) >= end
    coverage = {'state': 'complete' if complete else 'partial', 'assessed_scope': 'effective_authorized_scope_only',
                'period_complete': complete, 'candidate_count': 0, 'eligible_count': 0, 'excluded_count': 0,
                'issues': [], 'legacy_reference_count': 0, 'legacy_reference_amount_decimal': '0.00'}
    response['coverage'] = coverage
    eligible, missing = [], defaultdict(list)
    for record in chosen:
        if record['outcome'] != 'won':
            continue
        # Known foreign currency is outside the query, never converted or counted as missing.
        if record['currency'] is not None and record['currency'] != request['currency']:
            continue
        reporting_at, basis = record['closed_at'], 'recorded_close'
        if reporting_at is None and request['date_policy'] == 'recorded_close_or_audited_legacy_reference' and record['legacy_act_ref']:
            reporting_at, basis = record['created_at'], 'audited_legacy_creation'
        if reporting_at is not None and not start <= instant(reporting_at) < end:
            continue
        coverage['candidate_count'] += 1
        reasons = []
        if reporting_at is None: reasons.append('missing_date')
        if record['currency'] is None: reasons.append('missing_currency')
        if record['client_ref'] is None: reasons.append('missing_client')
        if record['revenue_decimal'] is None: reasons.append('missing_revenue')
        if not record['financial_evidence_ref'] or not record['date_evidence_ref']: reasons.append('missing_evidence')
        if request['metric'] == 'won_gross_profit' and record['cost_decimal'] is None: reasons.append('missing_cost')
        for reason in reasons: missing[reason].append(record)
        if reasons:
            coverage['excluded_count'] += 1
            continue
        metric = Decimal(record['revenue_decimal'])
        if request['metric'] == 'won_gross_profit': metric -= Decimal(record['cost_decimal'])
        eligible.append((record, metric, reporting_at, basis))
    coverage['eligible_count'] = len(eligible)
    for reason, records_with_issue in sorted(missing.items()):
        # Amounts are comparable only if every impacted record has the query currency/revenue.
        known = all(r['currency'] == request['currency'] and r['revenue_decimal'] is not None for r in records_with_issue)
        coverage['issues'].append({'reason': reason, 'count': len(records_with_issue),
                                   'known_amount_decimal': money(sum((Decimal(r['revenue_decimal']) for r in records_with_issue), ZERO)) if known else None,
                                   'known_amount_basis': 'revenue_before_vat', 'currency': request['currency'] if known else None})
    if missing: coverage['state'] = 'partial'
    if not eligible and (missing or not complete):
        return fail('MISSING_EVIDENCE' if missing else 'INCOMPLETE_SNAPSHOT')
    grouped = defaultdict(list)
    for item in eligible: grouped[item[0]['client_ref']].append(item)
    ordered = sorted(grouped, key=lambda key: (-sum((v[1] for v in grouped[key]), ZERO), key))
    total = sum((v[1] for v in eligible), ZERO)
    revenue = sum((Decimal(v[0]['revenue_decimal']) for v in eligible), ZERO)
    cost_known = can_read_profit and all(v[0]['cost_decimal'] is not None for v in eligible)
    # A verified empty universe has zero totals; permission still controls cost visibility.
    cost = sum((Decimal(v[0]['cost_decimal']) for v in eligible), ZERO) if cost_known else None
    if can_read_profit and not cost_known: response['warnings'].append(issue('MISSING_COST'))
    rows = []
    for client in ordered[:request['top_n']]:
        amount = sum((v[1] for v in grouped[client]), ZERO)
        refs = []
        for record, value, reporting_at, basis in grouped[client]:
            evidence_ref = f"evidence:{record['sale_ref']}:{record['version']}"
            refs.append(evidence_ref)
            response['evidence'].append({
                'ref': evidence_ref, 'client_ref': client, 'sale_ref': record['sale_ref'],
                'proposal_ref': record['proposal_ref'], 'lineage_ref': record['lineage_ref'], 'source_version': record['version'],
                'recorded_at': record['recorded_at'], 'date_basis': basis, 'reporting_at': reporting_at,
                'date_evidence_ref': record['legacy_act_ref'] if basis == 'audited_legacy_creation' else record['date_evidence_ref'],
                'financial_evidence_ref': record['financial_evidence_ref'], 'selection_evidence_ref': 'selection:source-asserted',
                'currency': record['currency'], 'revenue_decimal': record['revenue_decimal'], 'cost_decimal': record['cost_decimal'],
                'metric_amount_decimal': money(value),
            })
        rows.append({'kind': 'client', 'client_ref': client, 'label': grouped[client][0][0]['label'], 'amount_decimal': money(amount),
                     'share_pct': pct(amount / total * 100) if total else None, 'source_refs': refs, 'breakdown_ref': None})
    top = sum((Decimal(r['amount_decimal']) for r in rows), ZERO)
    others = total - top
    if len(ordered) > request['top_n']:
        rows.append({'kind': 'others', 'client_ref': None, 'label': 'Otros', 'amount_decimal': money(others),
                     'share_pct': pct(others / total * 100) if total else None, 'source_refs': [], 'breakdown_ref': 'breakdown:opaque-authorized'})
    legacy = [v for v in eligible if v[3] == 'audited_legacy_creation']
    coverage['legacy_reference_count'] = len(legacy)
    coverage['legacy_reference_amount_decimal'] = money(sum((v[1] for v in legacy), ZERO))
    if legacy: response['warnings'].append(issue('LEGACY_REFERENCE_USED'))
    status = 'no_data' if not eligible else ('partial' if coverage['state'] == 'partial' else 'ok')
    actual, reason = request['presentation'], None
    if stale:
        status, actual, reason = 'stale', 'table', 'stale_data'
        response['warnings'].append(issue('STALE_SNAPSHOT'))
    elif not eligible: actual, reason = 'table', 'no_data'
    elif coverage['state'] == 'partial': actual, reason = 'table', 'incomplete_coverage'
    elif actual == 'pie' and total <= 0: actual, reason = 'table', 'non_positive_total'
    elif actual == 'pie' and any(v[1] < 0 for v in eligible): actual, reason = 'table', 'negative_rows'
    if reason and request['presentation'] != actual: response['warnings'].append(issue('PRESENTATION_FALLBACK'))
    response.update(status=status, result={
        'currency': request['currency'], 'tax_basis': request['tax_basis'],
        'total_kind': 'authorized_total' if coverage['state'] == 'complete' else 'known_subtotal',
        'official_total_decimal': money(total), 'revenue_decimal': money(revenue), 'cost_decimal': money(cost) if cost is not None else None,
        'gross_profit_decimal': money(revenue-cost) if cost is not None else None,
        'margin_pct': pct((revenue-cost)/revenue*100) if cost is not None and revenue else None,
        'rows': rows, 'reconciliation': {'top_decimal': money(top), 'others_decimal': money(others), 'difference_decimal': '0.00'},
        'presentation': {'requested': request['presentation'], 'actual': actual, 'reason': reason},
    })
    return response


def validate_semantics(response, request):
    """Consumer invariants in addition to JSON Schema; source/auth replay is tested separately."""
    RESPONSE_VALIDATOR.validate(response)
    assert response['trace']['request_sha256'] == sha(request), 'Request digest'
    if response['status'] == 'forbidden': return
    if response['query'] is not None:
        assert response['query'] == request, 'Query binding'
        assert request['period']['start_date'] < request['period']['end_date_exclusive'], 'Period ordering'
    assert response['authorization']['decision'] == 'allowed', 'Authorization decision'
    assert instant(response['authorization']['evaluated_at']) <= instant(response['generated_at']) < instant(response['authorization']['valid_until']), 'Authorization validity'
    scope = response['authorization']['effective_scope']
    if response['snapshot'] is not None:
        assert response['snapshot']['scope_fingerprint'] == sha(scope), 'Scope binding'
        assert response['authorization']['scope_fingerprint'] == sha(scope), 'Authorization binding'
        age = int((instant(response['generated_at'])-instant(response['snapshot']['as_of'])).total_seconds())
        assert age >= 0 and response['freshness']['age_seconds'] == age, 'Snapshot age'
        assert (age > response['freshness']['max_age_seconds']) == (response['freshness']['state'] == 'stale'), 'Freshness threshold'
    result = response['result']
    if result is None: return
    if 'gross_profit.read' not in response['authorization']['permissions']:
        assert all(result[k] is None for k in ('cost_decimal','gross_profit_decimal','margin_pct')), 'Financial permission'
        assert all(e['cost_decimal'] is None for e in response['evidence']), 'Evidence financial permission'
    assert result['currency'] == request['currency'], 'Currency binding'
    assert result['presentation']['requested'] == request['presentation'], 'Presentation binding'
    coverage = response['coverage']
    assert coverage['candidate_count'] == coverage['eligible_count']+coverage['excluded_count'], 'Coverage reconciliation'
    assert len([r for r in result['rows'] if r['kind'] == 'client']) <= request['top_n'], 'Top limit'
    assert len([r for r in result['rows'] if r['kind'] == 'others']) <= 1, 'One Others'
    clients = [r['client_ref'] for r in result['rows'] if r['kind'] == 'client']
    assert len(clients) == len(set(clients)), 'Unique clients'
    total = Decimal(result['official_total_decimal'])
    assert sum((Decimal(r['amount_decimal']) for r in result['rows']), ZERO) == total, 'Total reconciliation'
    assert sum((Decimal(r['amount_decimal']) for r in result['rows'] if r['kind'] == 'client'), ZERO) == Decimal(result['reconciliation']['top_decimal']), 'Top reconciliation'
    assert sum((Decimal(r['amount_decimal']) for r in result['rows'] if r['kind'] == 'others'), ZERO) == Decimal(result['reconciliation']['others_decimal']), 'Others reconciliation'
    evidence = {e['ref']:e for e in response['evidence']}
    assert len(evidence) == len(response['evidence']), 'Duplicate evidence'
    used = []
    for row in result['rows']:
        assert row['share_pct'] == (pct(Decimal(row['amount_decimal'])/total*100) if total else None), 'Share denominator'
        if row['kind'] == 'others': continue
        sources = [evidence[k] for k in row['source_refs']]
        used += row['source_refs']
        assert all(e['client_ref'] == row['client_ref'] and e['currency'] == request['currency'] for e in sources), 'Evidence binding'
        assert sum((Decimal(e['metric_amount_decimal']) for e in sources), ZERO) == Decimal(row['amount_decimal']), 'Evidence sum'
        for e in sources:
            zone = ZoneInfo(request['period']['timezone'])
            start, end = [datetime.combine(date.fromisoformat(request['period'][k]), time.min, zone) for k in ('start_date', 'end_date_exclusive')]
            assert start <= instant(e['reporting_at']) < end, 'Evidence period'
            assert instant(e['recorded_at']) <= instant(response['snapshot']['as_of']), 'Historical version cutoff'
            if e['date_basis'] == 'audited_legacy_creation':
                assert request['date_policy'] == 'recorded_close_or_audited_legacy_reference', 'Legacy policy'
            amount = Decimal(e['revenue_decimal'])
            if request['metric'] == 'won_gross_profit':
                assert e['cost_decimal'] is not None, 'Missing cost'
                amount -= Decimal(e['cost_decimal'])
            assert amount == Decimal(e['metric_amount_decimal']), 'Financial evidence'
    assert len(used) == len(set(used)) and set(used) == set(evidence), 'Evidence reused or orphaned'
    revenue = Decimal(result['revenue_decimal'])
    if result['cost_decimal'] is None:
        assert result['gross_profit_decimal'] is None and result['margin_pct'] is None, 'Unknown cost is not zero'
    else:
        profit = revenue-Decimal(result['cost_decimal'])
        assert profit == Decimal(result['gross_profit_decimal']), 'Profit reconciliation'
        assert result['margin_pct'] == (pct(profit/revenue*100) if revenue else None), 'Weighted margin'
    assert total == Decimal(result['revenue_decimal'] if request['metric'] == 'won_revenue' else result['gross_profit_decimal']), 'Metric binding'
    sorted_rows = sorted((r for r in result['rows'] if r['kind'] == 'client'), key=lambda r: (-Decimal(r['amount_decimal']), r['client_ref']))
    assert [r['client_ref'] for r in sorted_rows] == clients, 'Ranking order'
    if result['presentation']['actual'] == 'pie':
        assert total > 0 and all(Decimal(r['amount_decimal']) >= 0 for r in result['rows']), 'Pie eligibility'
        assert response['status'] == 'ok', 'Pie completeness'


def verify_fixture_provenance(response, source, context):
    """Independent reference resolution against the synthetic source, not source authentication.

    A real adapter must verify its authenticated exporter, authorization and source
    assertions. An unkeyed digest supplied by the same caller cannot provide that.
    """
    if response['snapshot'] is None:
        return
    scope = response['authorization']['effective_scope']
    assert scope == {k: context[k] for k in ('tenant_ref','principal_ref','mode','seller_refs')}, 'Trusted scope'
    def visible(r):
        return r['tenant_ref'] == scope['tenant_ref'] and (scope['mode']=='tenant' or r['seller_ref'] in scope['seller_refs'])
    records = [r for r in source['records'] if visible(r)]
    if 'gross_profit.read' not in context['permissions']:
        records = [dict(r,cost_decimal=None) for r in records]
    selections = [s for s in source['selection'] if visible(s)]
    payload = {**{k:source[k] for k in ('as_of','exported_at','data_until','period_complete')},
               'records':records,'selection':selections,'scope':scope}
    assert response['snapshot']['integrity']['sha256'] == sha(payload), 'Source digest'
    assert response['snapshot']['source_revision'] == source['revision'], 'Source revision'
    for e in response['evidence']:
        key = (e['sale_ref'],e['proposal_ref'],e['source_version'])
        assert sum((s['sale_ref'],s['proposal_ref'],s['version'])==key for s in selections)==1, 'Official selection'
        matches = [r for r in records if (r['sale_ref'],r['proposal_ref'],r['version'])==key]
        assert len(matches)==1, 'Source reference'
        record = matches[0]
        assert record['client_ref']==e['client_ref'] and record['lineage_ref']==e['lineage_ref'], 'Source identity'
        assert all(record[k]==e[k] for k in ('currency','revenue_decimal','cost_decimal','recorded_at','financial_evidence_ref')), 'Source financial fields'
        assert e['reporting_at']==(record['closed_at'] if e['date_basis']=='recorded_close' else record['created_at']), 'Source date'
        assert e['date_evidence_ref']==(record['date_evidence_ref'] if e['date_basis']=='recorded_close' else record['legacy_act_ref']), 'Source date evidence'
