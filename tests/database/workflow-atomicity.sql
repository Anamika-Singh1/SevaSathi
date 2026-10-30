-- Local, disposable-project QA. Everything, including the failure trigger, rolls back.
begin;
create function private.phase_three_test_fail_audit() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.application_id='70000000-0000-4000-8000-000000000003' and new.event_type='SCREENING_SAVED' then
    raise exception 'FORCED_AUDIT_FAILURE';
  end if;
  return new;
end;
$$;
create trigger phase_three_test_fail_audit before insert on public.application_events
for each row execute function private.phase_three_test_fail_audit();

do $$
declare officer uuid; app_id uuid:='70000000-0000-4000-8000-000000000003';
  request uuid:=gen_random_uuid(); test_session uuid:=gen_random_uuid(); data jsonb; count_before integer;
begin
  select p.id into officer from public.profiles p join auth.users u on u.id=p.id
  where u.email='operator@sevasathi.example.com' and p.is_active and p.role='OPERATOR';
  if officer is null then raise exception 'Provision the demo operator first'; end if;
  insert into auth.sessions(id,user_id) values(test_session,officer);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',officer,'role','authenticated','session_id',test_session)::text,true);
  perform set_config('request.jwt.claim.sub',officer::text,true);
  insert into public.applications(id,reference_number,applicant_name,village,district,taluk,annual_income,purpose,is_demo,created_by)
  select app_id,'SS-2097-90000003','ಮಾದರಿ ಅಣು ಕಾರ್ಯಾಚರಣೆ ಪರೀಕ್ಷೆ','Atomicity test',p.district,p.taluk,0,'Temporary rollback test',true,p.id from public.profiles p where p.id=officer;
  select jsonb_build_object('screening_notes','This update must roll back on an audit failure.','checklist',jsonb_agg(jsonb_build_object('key',c.key,'status','RECEIVED','note','test'))) into data from public.application_checklist c where c.application_id=app_id;
  select count(*) into count_before from public.application_events where application_id=app_id;
  begin
    perform public.workflow_action(app_id,'SAVE',0,request,data);
    raise exception 'Expected forced audit failure';
  exception when others then
    if sqlerrm<>'FORCED_AUDIT_FAILURE' then raise; end if;
  end;
  if exists(select 1 from public.application_workflow where application_id=app_id and (version<>0 or screening_notes<>''))
    or exists(select 1 from public.application_checklist where application_id=app_id and receipt_status<>'MISSING')
    or exists(select 1 from private.workflow_requests where application_id=app_id)
    or (select count(*) from public.application_events where application_id=app_id)<>count_before then
    raise exception 'State/history leaked after database failure';
  end if;
  execute 'drop trigger phase_three_test_fail_audit on public.application_events';
  perform public.workflow_action(app_id,'SAVE',0,request,data);
  if (select version from public.application_workflow where application_id=app_id)<>1 then raise exception 'Retry did not commit'; end if;
  select count(*) into count_before from public.application_events where application_id=app_id;
  perform public.workflow_action(app_id,'SAVE',0,request,data);
  if (select count(*) from public.application_events where application_id=app_id)<>count_before then raise exception 'Retry duplicated history'; end if;
  raise notice 'PASS: audit insert failure rolls back checklist, state, version, and request receipt; safe retry commits exactly once.';
end;
$$;
rollback;
