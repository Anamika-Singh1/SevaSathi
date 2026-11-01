-- Administrator SQL Editor repair for SevaSathi Add application.
-- Run the WHOLE file in project qwbwoyzsnktumbcqxztl (the configured project).
-- Select all statements before Run; the final verification query cannot install functions.
-- Installs missing intake updates after the original setup parts 01-09.
-- Safe to rerun after success. Existing applications, receipts and sequence
-- values are preserved. No passwords/profiles are changed and RLS stays enabled.
-- This is an explicit administrator repair, not an automatic app migration.
begin;
set local lock_timeout = '5s';

do $sevasathi_repair$
declare
  target regclass;
  permission text;
  proc record;
  base_install_sql text;
  full_install_sql text;
  expected_body text;
  expected_arguments text[];
  body_matches boolean;
  arguments_match boolean;
  metadata_matches boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sevasathi.install.application-intake',0));
  if to_regclass('public.profiles') is null
    or to_regclass('public.applications') is null
    or to_regclass('public.application_workflow') is null
    or to_regclass('public.application_checklist') is null
    or to_regclass('public.application_notes') is null
    or to_regclass('public.application_events') is null
    or to_regclass('public.application_documents') is null
    or to_regclass('public.workflow_demo_settings') is null
    or to_regclass('public.application_worklist_base') is null
    or to_regprocedure('private.has_live_session()') is null
    or to_regprocedure('public.workflow_action(uuid,text,integer,uuid,jsonb)') is null then
    raise exception 'Original SevaSathi setup is incomplete. Finish parts 01-09 before this repair.';
  end if;
  foreach target in array array[
    'public.profiles'::regclass,'public.applications'::regclass,
    'public.application_documents'::regclass,'public.application_notes'::regclass,
    'public.application_events'::regclass,'public.application_workflow'::regclass,
    'public.application_checklist'::regclass,'public.workflow_demo_settings'::regclass
  ] loop
    if not (select relrowsecurity from pg_catalog.pg_class where oid=target) then
      raise exception 'RLS is not enabled on %. Inspect the original setup; repair made no changes.',target;
    end if;
    foreach permission in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if pg_catalog.has_table_privilege('authenticated',target,permission)
        or pg_catalog.has_table_privilege('anon',target,permission) then
        raise exception 'Unexpected untrusted write grant on %. Inspect the original setup; repair made no changes.',target;
      end if;
    end loop;
  end loop;

  -- Keep the source used for installation and verification together. Literal
  -- fingerprints can become stale when a SQL editor formats a copied script.
  base_install_sql := $sevasathi_base$
-- Officer intake is a narrow transactional RPC. Existing table write grants stay closed.
create sequence private.application_intake_reference_seq
  as bigint start with 100000 maxvalue 99999999 no cycle;
revoke all on sequence private.application_intake_reference_seq from public,anon,authenticated;

create table private.application_intake_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  fingerprint text not null,
  application_id uuid not null references public.applications(id) on delete cascade,
  result jsonb not null
);
revoke all on private.application_intake_requests from public,anon,authenticated;

create function public.create_application(
  request_id uuid,
  applicant_name text,
  village text,
  annual_income numeric,
  purpose text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  receipt private.application_intake_requests%rowtype;
  clean_name text:=pg_catalog.btrim(applicant_name);
  clean_village text:=pg_catalog.btrim(village);
  clean_purpose text:=pg_catalog.btrim(purpose);
  fingerprint text;
  generated_reference text;
  new_application_id uuid;
  response jsonb;
  attempt integer;
begin
  select p.* into actor from public.profiles p
  where p.id=auth.uid() and p.is_active for share;
  if not found or actor.role<>'OPERATOR' or not private.has_live_session() then
    raise exception using errcode='42501',message='INTAKE_FORBIDDEN';
  end if;
  if request_id is null or clean_name is null or clean_village is null or clean_purpose is null
    or pg_catalog.char_length(clean_name) not between 1 and 120
    or pg_catalog.char_length(clean_village) not between 1 and 120
    or pg_catalog.char_length(clean_purpose) not between 1 and 500
    or annual_income is null or annual_income::text in ('NaN','Infinity','-Infinity')
    or annual_income not between 0 and 9999999999.99
    or annual_income<>pg_catalog.round(annual_income,2) then
    raise exception using errcode='22023',message='INTAKE_INVALID_INPUT';
  end if;
  fingerprint:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('applicant_name',clean_name,'village',clean_village,
      'annual_income',pg_catalog.round(annual_income,2),'purpose',clean_purpose)::text,'UTF8')),'hex');
  -- A request UUID has a single lifetime owner and payload, including across server instances.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select r.* into receipt from private.application_intake_requests r
  where r.request_id=create_application.request_id;
  if found then
    if receipt.actor_id<>actor.id or receipt.fingerprint<>fingerprint then
      raise exception using errcode='22023',message='INTAKE_REQUEST_REUSED';
    end if;
    return receipt.result || pg_catalog.jsonb_build_object('duplicate',true);
  end if;

  -- Correlate the existing creation audit trigger without inheriting another action's context.
  perform pg_catalog.set_config('sevasathi.workflow_request_id',request_id::text,true);
  perform pg_catalog.set_config('sevasathi.workflow_reason','',true);
  perform pg_catalog.set_config('sevasathi.workflow_payload','{}',true);
  perform pg_catalog.set_config('sevasathi.previous_state',pg_catalog.jsonb_build_object('stage',null)::text,true);
  perform pg_catalog.set_config('sevasathi.new_state',pg_catalog.jsonb_build_object('stage','SUBMITTED','version',0)::text,true);
  for attempt in 1..10 loop
    generated_reference:='SS-' || pg_catalog.to_char(pg_catalog.timezone('Asia/Kolkata',pg_catalog.now()),'YYYY')
      || '-' || pg_catalog.nextval('private.application_intake_reference_seq'::pg_catalog.regclass)::text;
    insert into public.applications(reference_number,applicant_name,village,district,taluk,
      annual_income,purpose,status,created_by,is_demo)
    values(generated_reference,clean_name,clean_village,actor.district,actor.taluk,
      annual_income,clean_purpose,'SUBMITTED',actor.id,false)
    on conflict(reference_number) do nothing
    returning id into new_application_id;
    exit when new_application_id is not null;
  end loop;
  if new_application_id is null then
    raise exception using errcode='P0001',message='INTAKE_UNAVAILABLE';
  end if;
  -- Workflow/checklist initialization and the creation audit are existing INSERT triggers.
  response:=pg_catalog.jsonb_build_object('application_id',new_application_id,
    'reference_number',generated_reference,'duplicate',false);
  insert into private.application_intake_requests(request_id,actor_id,fingerprint,application_id,result)
  values(create_application.request_id,actor.id,fingerprint,new_application_id,response);
  return response;
exception when others then
  if sqlerrm in ('INTAKE_FORBIDDEN','INTAKE_INVALID_INPUT','INTAKE_REQUEST_REUSED','INTAKE_UNAVAILABLE') then
    raise;
  end if;
  -- No partial application, initialized workflow, audit event or receipt survives a failure.
  raise exception using errcode='P0001',message='INTAKE_UNAVAILABLE';
end;
$$;
revoke all on function public.create_application(uuid,text,text,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.create_application(uuid,text,text,numeric,text) to authenticated;

notify pgrst,'reload schema';

$sevasathi_base$;
  if to_regprocedure('public.create_application(uuid,text,text,numeric,text)') is null then
    if to_regclass('private.application_intake_reference_seq') is not null
      or to_regclass('private.application_intake_requests') is not null then
      raise exception 'Partial base intake objects exist. Run supabase/diagnose-application-intake.sql before repair.';
    end if;
    execute base_install_sql;
  end if;
  if to_regclass('private.application_intake_reference_seq') is null
    or to_regclass('private.application_intake_requests') is null then
    raise exception 'Existing base RPC is missing its private storage. Inspect database setup; no changes committed.';
  end if;

  full_install_sql := $sevasathi_full$
-- Preserve the existing combined workflow enum and expose explicit stage/status.
-- SUBMITTED remains the transition engine's document-screening value.
alter table public.applications
  add column application_date date generated always as ((submitted_at at time zone 'Asia/Kolkata')::date) stored,
  add column workflow_stage text generated always as (
    case status when 'SUBMITTED' then 'DOCUMENT_SCREENING'
      when 'FIELD_VERIFICATION' then 'FIELD_VERIFICATION'
      when 'UNDER_REVIEW' then 'CASEWORKER_REVIEW'
      when 'PENDING_APPROVAL' then 'FINAL_DECISION' else 'COMPLETED' end
  ) stored,
  add column processing_status text generated always as (
    case status when 'APPROVED' then 'APPROVED' when 'REJECTED' then 'REJECTED' else 'PENDING' end
  ) stored;

create index application_intake_requests_application_idx
  on private.application_intake_requests(application_id);

-- The five-argument RPC remains available for existing clients. Full intake
-- supplies all nine arguments, avoiding ambiguous PostgREST overload resolution.
create function public.create_application(
  request_id uuid, applicant_name text, village text, annual_income numeric, purpose text,
  application_date date, certificate_type text, documents jsonb, notes text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  receipt private.application_intake_requests%rowtype;
  clean_name text:=pg_catalog.btrim(applicant_name);
  clean_village text:=pg_catalog.btrim(village);
  clean_purpose text:=pg_catalog.btrim(purpose);
  clean_notes text:=pg_catalog.btrim(coalesce(notes,''));
  canonical_documents jsonb;
  document jsonb;
  fingerprint text;
  generated_reference text;
  new_application_id uuid;
  response jsonb;
  attempt integer;
begin
  select p.* into actor from public.profiles p
    where p.id=auth.uid() and p.is_active for share;
  if not found or actor.role<>'OPERATOR' or not private.has_live_session() then
    raise exception using errcode='42501',message='INTAKE_FORBIDDEN';
  end if;
  if request_id is null or clean_name is null or clean_village is null or clean_purpose is null
    or pg_catalog.char_length(clean_name) not between 1 and 120
    or pg_catalog.char_length(clean_village) not between 1 and 120
    or pg_catalog.char_length(clean_purpose) not between 1 and 500
    or pg_catalog.char_length(clean_notes)>4000
    or annual_income is null or annual_income::text in ('NaN','Infinity','-Infinity')
    or annual_income not between 0 and 9999999999.99 or annual_income<>pg_catalog.round(annual_income,2)
    or certificate_type is distinct from 'INCOME'
    or application_date is null or application_date<'1900-01-01'::date
    or application_date>(pg_catalog.now() at time zone 'Asia/Kolkata')::date
    or pg_catalog.jsonb_typeof(documents) is distinct from 'array' then
    raise exception using errcode='22023',message='INTAKE_INVALID_INPUT';
  end if;
  if pg_catalog.jsonb_array_length(documents)<>3 then
    raise exception using errcode='22023',message='INTAKE_INVALID_INPUT';
  end if;
  for document in select value from pg_catalog.jsonb_array_elements(documents) loop
    if pg_catalog.jsonb_typeof(document) is distinct from 'object' then
      raise exception using errcode='22023',message='INTAKE_INVALID_INPUT';
    end if;
    if (select count(*) from pg_catalog.jsonb_object_keys(document))<>2
      or pg_catalog.jsonb_typeof(document->'key') is distinct from 'string'
      or document->>'key' not in ('income_declaration','identity_proof','residence_proof')
      or pg_catalog.jsonb_typeof(document->'status') is distinct from 'string'
      or document->>'status' not in ('RECEIVED','MISSING') then
      raise exception using errcode='22023',message='INTAKE_INVALID_INPUT';
    end if;
  end loop;
  if (select count(distinct value->>'key') from pg_catalog.jsonb_array_elements(documents))<>3 then
    raise exception using errcode='22023',message='INTAKE_INVALID_INPUT';
  end if;
  select pg_catalog.jsonb_agg(value order by value->>'key') into canonical_documents
    from pg_catalog.jsonb_array_elements(documents);
  fingerprint:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('applicant_name',clean_name,'village',clean_village,
      'annual_income',pg_catalog.round(annual_income,2),'purpose',clean_purpose,
      'application_date',application_date,'certificate_type',certificate_type,
      'documents',canonical_documents,'notes',clean_notes)::text,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select r.* into receipt from private.application_intake_requests r
    where r.request_id=create_application.request_id;
  if found then
    if receipt.actor_id<>actor.id or receipt.fingerprint<>fingerprint then
      raise exception using errcode='22023',message='INTAKE_REQUEST_REUSED';
    end if;
    return receipt.result || pg_catalog.jsonb_build_object('duplicate',true);
  end if;

  perform pg_catalog.set_config('sevasathi.workflow_request_id',request_id::text,true);
  perform pg_catalog.set_config('sevasathi.workflow_reason','',true);
  perform pg_catalog.set_config('sevasathi.workflow_payload','{}',true);
  perform pg_catalog.set_config('sevasathi.previous_state',pg_catalog.jsonb_build_object('stage',null)::text,true);
  perform pg_catalog.set_config('sevasathi.new_state',pg_catalog.jsonb_build_object(
    'stage','SUBMITTED','workflow_stage','DOCUMENT_SCREENING','status','PENDING','version',0,
    'application_date',application_date,'certificate_type','INCOME',
    'documents',canonical_documents,'notes',clean_notes)::text,true);
  for attempt in 1..10 loop
    generated_reference:='SS-' || pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Kolkata','YYYY')
      || '-' || pg_catalog.nextval('private.application_intake_reference_seq'::pg_catalog.regclass)::text;
    insert into public.applications(reference_number,applicant_name,village,district,taluk,
      annual_income,purpose,status,created_by,is_demo,submitted_at)
    values(generated_reference,clean_name,clean_village,actor.district,actor.taluk,
      annual_income,clean_purpose,'SUBMITTED',actor.id,false,
      application_date::timestamp at time zone 'Asia/Kolkata')
    on conflict(reference_number) do nothing returning id into new_application_id;
    exit when new_application_id is not null;
  end loop;
  if new_application_id is null then
    raise exception using errcode='P0001',message='INTAKE_UNAVAILABLE';
  end if;
  -- INSERT triggers initialize workflow and append APPLICATION_CREATED in this
  -- same transaction. Document receipts and notes must also succeed before commit.
  if not exists(select 1 from public.application_workflow w
    where w.application_id=new_application_id and w.operator_id=actor.id) then
    raise exception using errcode='P0001',message='INTAKE_UNAVAILABLE';
  end if;
  update public.application_checklist c set receipt_status=d.value->>'status'
    from pg_catalog.jsonb_array_elements(canonical_documents) d
    where c.application_id=new_application_id and c.key=d.value->>'key';
  if (select count(*) from public.application_checklist c where c.application_id=new_application_id)<>3 then
    raise exception using errcode='P0001',message='INTAKE_UNAVAILABLE';
  end if;
  if clean_notes<>'' then
    insert into public.application_notes(application_id,author_id,body)
      values(new_application_id,actor.id,clean_notes);
  end if;
  response:=pg_catalog.jsonb_build_object('application_id',new_application_id,
    'reference_number',generated_reference,'duplicate',false);
  insert into private.application_intake_requests(request_id,actor_id,fingerprint,application_id,result)
    values(create_application.request_id,actor.id,fingerprint,new_application_id,response);
  return response;
exception when others then
  if sqlerrm in ('INTAKE_FORBIDDEN','INTAKE_INVALID_INPUT','INTAKE_REQUEST_REUSED','INTAKE_UNAVAILABLE') then raise; end if;
  raise log 'Application intake failed: SQLSTATE %, request %',sqlstate,request_id;
  raise exception using errcode='P0001',message='INTAKE_UNAVAILABLE';
end;
$$;
revoke all on function public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text) to authenticated;

-- Append new columns without replacing the existing read-model calculations or RLS.
create or replace view public.application_worklist with (security_invoker=true) as
select b.*,w.clarification_pending,w.resume_status,w.version as workflow_version,
  a.application_date,a.workflow_stage,a.processing_status
from public.application_worklist_base b
join public.application_workflow w on w.application_id=b.id
join public.applications a on a.id=b.id;

notify pgrst,'reload schema';

$sevasathi_full$;
  if to_regprocedure('public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)') is null then
    if exists(select 1 from pg_catalog.pg_attribute
      where attrelid='public.applications'::regclass and not attisdropped
        and attname in ('application_date','workflow_stage','processing_status'))
      or to_regclass('private.application_intake_requests_application_idx') is not null then
      raise exception 'Partial full-intake objects exist. Run supabase/diagnose-application-intake.sql before repair.';
    end if;
    execute full_install_sql;
  end if;

  -- Only restore API execution grants on the exact reviewed implementations.
  -- Differing custom functions are left untouched; the whole repair rolls back.
  for proc in select p.oid,p.prosrc,p.prosecdef,p.proconfig,p.proargnames,
      p.prorettype,p.proretset,p.prokind,p.pronargdefaults
    from pg_catalog.pg_proc p where p.oid in (
      to_regprocedure('public.create_application(uuid,text,text,numeric,text)'),
      to_regprocedure('public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)')
    ) loop
    if proc.oid=to_regprocedure('public.create_application(uuid,text,text,numeric,text)') then
      expected_body:=pg_catalog.split_part(base_install_sql,'$$',2);
      expected_arguments:=array['request_id','applicant_name','village','annual_income','purpose'];
    else
      expected_body:=pg_catalog.split_part(full_install_sql,'$$',2);
      expected_arguments:=array['request_id','applicant_name','village','annual_income','purpose',
        'application_date','certificate_type','documents','notes'];
    end if;
    body_matches:=pg_catalog.btrim(pg_catalog.replace(proc.prosrc,E'\r\n',E'\n'),E' \t\r\n')
      is not distinct from pg_catalog.btrim(pg_catalog.replace(expected_body,E'\r\n',E'\n'),E' \t\r\n');
    arguments_match:=proc.proargnames is not distinct from expected_arguments;
    metadata_matches:=proc.prosecdef and coalesce(proc.proconfig @> array['search_path=""'],false)
      and proc.prorettype='jsonb'::regtype and not proc.proretset
      and proc.prokind='f' and proc.pronargdefaults=0;
    if not body_matches or not arguments_match or not metadata_matches then
      raise exception 'Intake RPC % differs from the definition in this repair file. No changes committed.',
        proc.oid::regprocedure
        using detail=pg_catalog.format('Body matches: %s; parameter names match: %s; function security/type matches: %s.',
          body_matches,arguments_match,metadata_matches);
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_attribute
    where attrelid='public.applications'::regclass and not attisdropped
      and attname in ('application_date','workflow_stage','processing_status') and attgenerated='s')<>3 then
    raise exception 'Full intake generated columns are incomplete. No changes committed.';
  end if;
  if not coalesce((select reloptions @> array['security_invoker=true']
    from pg_catalog.pg_class where oid='public.application_worklist'::regclass),false) then
    raise exception 'Application worklist must preserve caller RLS. No changes committed.';
  end if;
end;
$sevasathi_repair$;

revoke all on function public.create_application(uuid,text,text,numeric,text)
  from public,anon,authenticated,service_role;
revoke all on function public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_application(uuid,text,text,numeric,text) to authenticated;
grant execute on function public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;

-- Final verification is read-only. Running only this query must never report
-- READY when the installation above has not actually been executed.
with required(signature, argument_names) as (
  values
    ('public.create_application(uuid,text,text,numeric,text)',
      array['request_id','applicant_name','village','annual_income','purpose']::text[]),
    ('public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)',
      array['request_id','applicant_name','village','annual_income','purpose',
        'application_date','certificate_type','documents','notes']::text[])
)
select case when has_schema_privilege('authenticated','public','USAGE')
  and not exists (
    select 1 from required r
    left join pg_catalog.pg_proc p on p.oid=to_regprocedure(r.signature)
    where p.oid is null
      or p.proargnames is distinct from r.argument_names
      or not coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false)
      or coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false)
  ) then 'READY: Add application database functions installed'
    else 'NOT_READY: Intake functions, parameter names or permissions are missing. Run the entire repair file.'
  end as result,
  to_regprocedure('public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)')::text as creation_function,
  (select count(*) from public.applications) as existing_applications;

