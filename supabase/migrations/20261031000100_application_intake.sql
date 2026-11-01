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
