-- Read-only intake contract diagnosis. Run on the same project as the app.
-- Does not create records, change users, apply migrations or expose secrets.
-- READY_IN_DATABASE does not assert that PostgREST has refreshed its cache.
with expected(contract, signature, argument_names) as (
  values
    ('legacy', 'public.create_application(uuid,text,text,numeric,text)',
      array['request_id','applicant_name','village','annual_income','purpose']::text[]),
    ('current_form', 'public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)',
      array['request_id','applicant_name','village','annual_income','purpose',
        'application_date','certificate_type','documents','notes']::text[])
), checked as (
  select e.contract, e.signature, e.argument_names as expected_arguments,
    p.oid, p.proargnames as installed_arguments,
    p.prorettype = 'jsonb'::regtype and not p.proretset
      and p.prokind = 'f' and p.provariadic = 0 and p.pronargdefaults = 0
      and p.prosecdef and coalesce(p.proconfig @> array['search_path=""'], false)
      as function_configuration_matches,
    has_schema_privilege('authenticated', 'public', 'USAGE') as officer_schema_usage,
    coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false)
      as officer_execute,
    coalesce(has_function_privilege('anon', p.oid, 'EXECUTE'), false)
      as anonymous_execute
  from expected e
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(e.signature)
)
select contract,
  case
    when oid is null then 'MISSING_FUNCTION'
    when installed_arguments is distinct from expected_arguments then 'PARAMETER_NAMES_MISMATCH'
    when not officer_schema_usage then 'MISSING_SCHEMA_USAGE'
    when not officer_execute then 'MISSING_EXECUTE_GRANT'
    when not function_configuration_matches then 'FUNCTION_CONFIGURATION_MISMATCH'
    when anonymous_execute then 'UNEXPECTED_ANONYMOUS_EXECUTE'
    else 'READY_IN_DATABASE'
  end as diagnosis,
  signature, expected_arguments, installed_arguments,
  officer_schema_usage, officer_execute, anonymous_execute
from checked order by contract;
