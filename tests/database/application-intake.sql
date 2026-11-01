-- Disposable local-project QA. Data, synthetic sessions and fault triggers roll back.
-- Sequence values intentionally do not roll back; harmless reference gaps may remain.
begin;

create function private.intake_test_snapshot() returns jsonb
language sql set search_path='' as $$
  select pg_catalog.jsonb_build_object(
    'applications',(select count(*) from public.applications),
    'workflow',(select count(*) from public.application_workflow),
    'checklist',(select count(*) from public.application_checklist),
    'events',(select count(*) from public.application_events),
    'notes',(select count(*) from public.application_notes),
    'receipts',(select count(*) from private.application_intake_requests));
$$;
revoke all on function private.intake_test_snapshot() from public,anon,authenticated;

create function private.intake_test_fail_audit() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_setting('sevasathi.intake_test_failure',true)='audit'
    and new.event_type='APPLICATION_CREATED' then
    raise exception 'FORCED_INTAKE_AUDIT_FAILURE';
  end if;
  return new;
end;
$$;
create trigger intake_test_fail_audit before insert on public.application_events
for each row execute function private.intake_test_fail_audit();

create function private.intake_test_fail_receipt() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_setting('sevasathi.intake_test_failure',true)='receipt' then
    raise exception 'FORCED_INTAKE_RECEIPT_FAILURE';
  end if;
  return new;
end;
$$;
create trigger intake_test_fail_receipt before insert on private.application_intake_requests
for each row execute function private.intake_test_fail_receipt();

create function private.intake_test_fail_notes() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_setting('sevasathi.intake_test_failure',true)='notes' then
    raise exception 'FORCED_INTAKE_NOTES_FAILURE';
  end if;
  return new;
end;
$$;
create trigger intake_test_fail_notes before insert on public.application_notes
for each row execute function private.intake_test_fail_notes();

do $$
declare
  member record;
  bad record;
  actors jsonb:='{}';
  sessions jsonb:='{}';
  officer_count integer:=0;
  test_operator_id uuid;
  operator_session uuid;
  test_application_id uuid;
  request uuid:=gen_random_uuid();
  synthetic_session uuid;
  first_result jsonb;
  result jsonb;
  snapshot jsonb;
  failure text;
  collision_number bigint;
  collision_reference text;
  role_name text;
  permission text;
  proc record;
begin
  for member in
    select p.id,p.role from public.profiles p join auth.users u on u.id=p.id
    join (values
      ('operator@sevasathi.example.com','OPERATOR'),
      ('field.officer@sevasathi.example.com','FIELD_OFFICER'),
      ('caseworker@sevasathi.example.com','CASEWORKER'),
      ('approving.officer@sevasathi.example.com','APPROVING_OFFICER')
    ) expected(email,role) on u.email=expected.email and p.role::text=expected.role
    where p.is_active
  loop
    synthetic_session:=gen_random_uuid();
    insert into auth.sessions(id,user_id) values(synthetic_session,member.id);
    actors:=actors || jsonb_build_object(member.role::text,member.id);
    sessions:=sessions || jsonb_build_object(member.role::text,synthetic_session);
    officer_count:=officer_count+1;
  end loop;
  if officer_count<>4 then raise exception 'Provision all four fictional demo officers before intake QA'; end if;
  test_operator_id:=(actors->>'OPERATOR')::uuid;
  operator_session:=(sessions->>'OPERATOR')::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_operator_id,'role','authenticated','session_id',operator_session)::text,true);
  perform set_config('request.jwt.claim.sub',test_operator_id::text,true);

  first_result:=public.create_application(request,'  ಮಾದರಿ ಹೊಸ ಅರ್ಜಿ  ','  Intake test village  ',48000.50,'  Disposable intake test  ');
  test_application_id:=(first_result->>'application_id')::uuid;
  if test_application_id is null or first_result->>'duplicate'<>'false'
    or first_result->>'reference_number' !~ ('^SS-' || to_char(now() at time zone 'Asia/Kolkata','YYYY') || '-[0-9]{6,8}$') then
    raise exception 'Intake response/reference is invalid';
  end if;
  if not exists(
    select 1 from public.applications a join public.profiles p on p.id=test_operator_id
    where a.id=test_application_id and a.reference_number=first_result->>'reference_number'
      and a.status='SUBMITTED' and a.created_by=test_operator_id and not a.is_demo
      and a.district=p.district and a.taluk=p.taluk
      and a.applicant_name='ಮಾದರಿ ಹೊಸ ಅರ್ಜಿ' and a.village='Intake test village'
      and a.annual_income=48000.50 and a.purpose='Disposable intake test'
      and a.certificate_type='ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ / Income certificate'
  ) then raise exception 'Intake did not derive ownership/jurisdiction or normalize entered fields'; end if;
  if not exists(select 1 from public.application_workflow w where w.application_id=test_application_id and w.operator_id=test_operator_id and w.version=0)
    or (select count(*) from public.application_checklist c where c.application_id=test_application_id)<>3
    or exists(select 1 from public.application_checklist c where c.application_id=test_application_id and c.receipt_status<>'MISSING') then
    raise exception 'Intake did not initialize the workflow and document checklist';
  end if;
  if (select count(*) from public.application_events e where e.application_id=test_application_id)<>1
    or not exists(select 1 from public.application_events e where e.application_id=test_application_id
      and e.event_type='APPLICATION_CREATED' and e.actor_id=test_operator_id and e.actor_role='OPERATOR'
      and e.request_id=request and e.new_state->>'stage'='SUBMITTED' and e.created_at is not null)
    or not exists(select 1 from private.application_intake_requests r where r.request_id=request
      and r.actor_id=test_operator_id and r.application_id=test_application_id and r.result=first_result) then
    raise exception 'Intake creation audit or idempotency receipt is incomplete';
  end if;

  snapshot:=private.intake_test_snapshot();
  result:=public.create_application(request,'ಮಾದರಿ ಹೊಸ ಅರ್ಜಿ','Intake test village',48000.5,'Disposable intake test');
  if result<>(first_result || '{"duplicate":true}'::jsonb) or private.intake_test_snapshot()<>snapshot then
    raise exception 'An identical retry duplicated intake data/history or returned a different application';
  end if;
  begin
    perform public.create_application(request,'Edited fictional applicant','Intake test village',48000.5,'Disposable intake test');
    raise exception 'Expected changed-payload request reuse denial';
  exception when sqlstate '22023' then
    if sqlerrm<>'INTAKE_REQUEST_REUSED' then raise; end if;
  end;
  if private.intake_test_snapshot()<>snapshot then raise exception 'Changed-payload retry wrote data'; end if;

  -- All three downstream roles are denied even with a real, live synthetic session.
  foreach role_name in array array['FIELD_OFFICER','CASEWORKER','APPROVING_OFFICER'] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actors->>role_name,'role','authenticated','session_id',sessions->>role_name)::text,true);
    perform set_config('request.jwt.claim.sub',actors->>role_name,true);
    begin
      perform public.create_application(gen_random_uuid(),'Unauthorized applicant','Test village',0,'Must not be created');
      raise exception 'Expected downstream-role denial';
    exception when insufficient_privilege then
      if sqlerrm<>'INTAKE_FORBIDDEN' then raise; end if;
    end;
  end loop;
  if private.intake_test_snapshot()<>snapshot then raise exception 'Unauthorized roles created intake data'; end if;

  -- A second operator still cannot claim the first operator's request identity.
  update public.profiles set role='OPERATOR' where id=(actors->>'FIELD_OFFICER')::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actors->>'FIELD_OFFICER','role','authenticated','session_id',sessions->>'FIELD_OFFICER')::text,true);
  perform set_config('request.jwt.claim.sub',actors->>'FIELD_OFFICER',true);
  begin
    perform public.create_application(request,'ಮಾದರಿ ಹೊಸ ಅರ್ಜಿ','Intake test village',48000.5,'Disposable intake test');
    raise exception 'Expected cross-actor request reuse denial';
  exception when sqlstate '22023' then
    if sqlerrm<>'INTAKE_REQUEST_REUSED' then raise; end if;
  end;
  update public.profiles set role='FIELD_OFFICER' where id=(actors->>'FIELD_OFFICER')::uuid;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_operator_id,'role','authenticated','session_id',operator_session)::text,true);
  perform set_config('request.jwt.claim.sub',test_operator_id::text,true);
  delete from auth.sessions where id=operator_session;
  begin
    perform public.create_application(gen_random_uuid(),'Revoked session applicant','Test village',0,'Must not be created');
    raise exception 'Expected revoked-session denial';
  exception when insufficient_privilege then
    if sqlerrm<>'INTAKE_FORBIDDEN' then raise; end if;
  end;
  insert into auth.sessions(id,user_id) values(operator_session,test_operator_id);
  update public.profiles set is_active=false where id=test_operator_id;
  begin
    perform public.create_application(gen_random_uuid(),'Inactive officer applicant','Test village',0,'Must not be created');
    raise exception 'Expected inactive-officer denial';
  exception when insufficient_privilege then
    if sqlerrm<>'INTAKE_FORBIDDEN' then raise; end if;
  end;
  update public.profiles set is_active=true where id=test_operator_id;
  if private.intake_test_snapshot()<>snapshot then raise exception 'Revoked/inactive intake changed state'; end if;

  begin
    perform public.create_application(null,'Test applicant','Test village',0,'Test purpose');
    raise exception 'Expected missing request identity denial';
  exception when sqlstate '22023' then
    if sqlerrm<>'INTAKE_INVALID_INPUT' then raise; end if;
  end;
  for bad in select * from (values
    (null::text,'Village'::text,0::numeric,'Purpose'::text),
    ('   ','Village',0,'Purpose'),
    (repeat('x',121),'Village',0,'Purpose'),
    ('Applicant',null,0,'Purpose'),
    ('Applicant','   ',0,'Purpose'),
    ('Applicant',repeat('x',121),0,'Purpose'),
    ('Applicant','Village',null,'Purpose'),
    ('Applicant','Village',-0.01,'Purpose'),
    ('Applicant','Village',10000000000,'Purpose'),
    ('Applicant','Village',1.001,'Purpose'),
    ('Applicant','Village','NaN'::numeric,'Purpose'),
    ('Applicant','Village','Infinity'::numeric,'Purpose'),
    ('Applicant','Village','-Infinity'::numeric,'Purpose'),
    ('Applicant','Village',0,null),
    ('Applicant','Village',0,'   '),
    ('Applicant','Village',0,repeat('x',501))
  ) input(applicant_name,village,annual_income,purpose) loop
    begin
      perform public.create_application(gen_random_uuid(),bad.applicant_name,bad.village,bad.annual_income,bad.purpose);
      raise exception 'Expected invalid intake input denial';
    exception when sqlstate '22023' then
      if sqlerrm<>'INTAKE_INVALID_INPUT' then raise; end if;
    end;
  end loop;
  if private.intake_test_snapshot()<>snapshot then raise exception 'Invalid intake requests wrote state/history'; end if;
  perform public.create_application(gen_random_uuid(),'Zero income fictional applicant','Test village',0,'Boundary test');
  perform public.create_application(gen_random_uuid(),repeat('n',120),repeat('v',120),9999999999.99,repeat('p',500));

  -- Reserve the next reference manually; intake must skip it and keep initialization atomic.
  collision_number:=nextval('private.application_intake_reference_seq'::regclass)+1;
  collision_reference:='SS-' || to_char(now() at time zone 'Asia/Kolkata','YYYY') || '-' || collision_number::text;
  insert into public.applications(reference_number,applicant_name,village,district,taluk,annual_income,purpose,created_by,is_demo)
  select collision_reference,'Fictional reference collision','Test village',p.district,p.taluk,0,'Collision fixture',test_operator_id,true
  from public.profiles p where p.id=test_operator_id
  on conflict(reference_number) do nothing;
  result:=public.create_application(gen_random_uuid(),'Collision retry applicant','Test village',0,'Reference collision retry');
  if result->>'reference_number'=collision_reference or (result->>'duplicate')::boolean then
    raise exception 'Reference collision was not retried safely';
  end if;

  -- Audit failure, and a later receipt failure after all child/audit inserts, both roll back.
  foreach failure in array array['audit','receipt'] loop
    snapshot:=private.intake_test_snapshot();
    perform set_config('sevasathi.intake_test_failure',failure,true);
    begin
      perform public.create_application(gen_random_uuid(),'Atomic rollback applicant','Test village',0,'Fault injection');
      raise exception 'Expected injected intake failure';
    exception when sqlstate 'P0001' then
      if sqlerrm<>'INTAKE_UNAVAILABLE' then raise; end if;
    end;
    perform set_config('sevasathi.intake_test_failure','',true);
    if private.intake_test_snapshot()<>snapshot then raise exception 'Intake failure leaked application, children, audit or receipt'; end if;
  end loop;

  if has_function_privilege('anon','public.create_application(uuid,text,text,numeric,text)','EXECUTE')
    or has_function_privilege('service_role','public.create_application(uuid,text,text,numeric,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.create_application(uuid,text,text,numeric,text)','EXECUTE') then
    raise exception 'Unexpected intake execution grants';
  end if;
  select prosecdef,proconfig into proc from pg_proc where oid='public.create_application(uuid,text,text,numeric,text)'::regprocedure;
  if not proc.prosecdef or not coalesce(proc.proconfig @> array['search_path=""'],false) then raise exception 'Unsafe intake execution context'; end if;
  foreach role_name in array array['anon','authenticated'] loop
    foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if has_table_privilege(role_name,'private.application_intake_requests',permission) then raise exception 'Private intake receipt grant exposed'; end if;
    end loop;
    foreach permission in array array['USAGE','SELECT','UPDATE'] loop
      if has_sequence_privilege(role_name,'private.application_intake_reference_seq',permission) then raise exception 'Private intake sequence grant exposed'; end if;
    end loop;
  end loop;
  perform set_config('sevasathi.intake_test_application',test_application_id::text,true);
  raise notice 'PASS: operator intake, trusted ownership/jurisdiction, initialized checklist, audit, idempotency, actor/role/session denial, validation, reference collision and atomic rollback.';
end;
$$;

do $$
declare
  request uuid:=gen_random_uuid();
  application uuid;
  first_result jsonb;
  result jsonb;
  snapshot jsonb;
  bad jsonb;
  failure text;
  member record;
  claims text:=current_setting('request.jwt.claims');
  actor uuid:=auth.uid();
  received_date date:=(now() at time zone 'Asia/Kolkata')::date-2;
  documents jsonb:='[{"key":"income_declaration","status":"MISSING"},{"key":"identity_proof","status":"RECEIVED"},{"key":"residence_proof","status":"RECEIVED"}]';
begin
  first_result:=public.create_application(request,'Complete intake applicant','Complete intake village',1000,'Complete intake test',received_date,'INCOME',documents,'  Optional intake note  ');
  application:=(first_result->>'application_id')::uuid;
  if not exists(select 1 from public.applications a where a.id=application and a.application_date=received_date
    and a.workflow_stage='DOCUMENT_SCREENING' and a.processing_status='PENDING' and a.status='SUBMITTED'
    and a.created_by=actor) then raise exception 'Complete intake date/stage/status is incorrect'; end if;
  if not exists(select 1 from public.application_workflow w where w.application_id=application and w.operator_id=actor)
    or (select count(*) from public.application_checklist c where c.application_id=application and c.receipt_status='RECEIVED')<>2
    or not exists(select 1 from public.application_notes n where n.application_id=application and n.author_id=actor and n.body='Optional intake note')
    or (select count(*) from public.application_events e where e.application_id=application and e.event_type='APPLICATION_CREATED')<>1
    or not exists(select 1 from public.application_events e where e.application_id=application and e.new_state->>'status'='PENDING'
      and e.new_state->>'workflow_stage'='DOCUMENT_SCREENING' and e.new_state->'documents' @> documents) then
    raise exception 'Complete intake did not atomically save assignment, documents, notes and audit';
  end if;
  snapshot:=private.intake_test_snapshot();
  result:=public.create_application(request,'Complete intake applicant','Complete intake village',1000,'Complete intake test',received_date,'INCOME',
    jsonb_build_array(documents->2,documents->0,documents->1),'Optional intake note');
  if result<>first_result || '{"duplicate":true}'::jsonb or private.intake_test_snapshot()<>snapshot then
    raise exception 'Reordered document retry duplicated complete intake';
  end if;
  begin
    perform public.create_application(request,'Complete intake applicant','Complete intake village',1000,'Complete intake test',received_date,'INCOME',documents,'Changed note');
    raise exception 'Changed notes reused committed request';
  exception when sqlstate '22023' then if sqlerrm<>'INTAKE_REQUEST_REUSED' then raise; end if; end;
  for bad in select value from jsonb_array_elements('[null,{},[],[{}, {}, {}],[1,2,3],[{"key":"identity_proof","status":"RECEIVED"},{"key":"identity_proof","status":"MISSING"},{"key":"residence_proof","status":"MISSING"}]]') loop
    begin
      perform public.create_application(gen_random_uuid(),'Invalid docs applicant','Village',0,'Invalid docs',received_date,'INCOME',bad,'');
      raise exception 'Invalid document payload accepted';
    exception when sqlstate '22023' then if sqlerrm<>'INTAKE_INVALID_INPUT' then raise; end if; end;
  end loop;
  begin
    perform public.create_application(gen_random_uuid(),'Future applicant','Village',0,'Future date',(now() at time zone 'Asia/Kolkata')::date+1,'INCOME',documents,'');
    raise exception 'Future application date accepted';
  exception when sqlstate '22023' then if sqlerrm<>'INTAKE_INVALID_INPUT' then raise; end if; end;
  begin
    perform public.create_application(gen_random_uuid(),'Wrong service','Village',0,'Wrong service',received_date,'FORGED',documents,'');
    raise exception 'Unsupported certificate accepted';
  exception when sqlstate '22023' then if sqlerrm<>'INTAKE_INVALID_INPUT' then raise; end if; end;
  if private.intake_test_snapshot()<>snapshot then raise exception 'Invalid extended intake wrote records'; end if;
  foreach failure in array array['audit','notes','receipt'] loop
    perform set_config('sevasathi.intake_test_failure',failure,true);
    begin
      perform public.create_application(gen_random_uuid(),'Atomic full intake','Village',0,'Rollback test',received_date,'INCOME',documents,'Must roll back');
      raise exception 'Expected extended intake failure';
    exception when sqlstate 'P0001' then if sqlerrm<>'INTAKE_UNAVAILABLE' then raise; end if; end;
    perform set_config('sevasathi.intake_test_failure','',true);
    if private.intake_test_snapshot()<>snapshot then raise exception 'Extended intake failure leaked records'; end if;
  end loop;
  for member in select p.id,s.id as session_id from public.profiles p join auth.sessions s on s.user_id=p.id
    where p.role<>'OPERATOR' and p.is_active loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',member.id,'role','authenticated','session_id',member.session_id)::text,true);
    perform set_config('request.jwt.claim.sub',member.id::text,true);
    begin
      perform public.create_application(gen_random_uuid(),'Unauthorized full intake','Village',0,'Forbidden',received_date,'INCOME',documents,'');
      raise exception 'Downstream role created complete intake';
    exception when insufficient_privilege then if sqlerrm<>'INTAKE_FORBIDDEN' then raise; end if; end;
  end loop;
  perform set_config('request.jwt.claims',claims,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if has_function_privilege('anon','public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)','EXECUTE')
    or has_function_privilege('service_role','public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)','EXECUTE') then
    raise exception 'Unexpected full intake execution grants';
  end if;
  raise notice 'PASS: full intake dates, screening/pending state, document receipts, notes, audit, retry, invalid input, downstream denials and three atomic rollback points.';
end;
$$;

set local role authenticated;
do $$
declare test_application_id uuid:=current_setting('sevasathi.intake_test_application')::uuid;
begin
  if not exists(select 1 from public.applications a where a.id=test_application_id and a.created_by=auth.uid())
    or not exists(select 1 from public.application_workflow w where w.application_id=test_application_id)
    or (select count(*) from public.application_checklist c where c.application_id=test_application_id)<>3
    or not exists(select 1 from public.application_events e where e.application_id=test_application_id and e.event_type='APPLICATION_CREATED') then
    raise exception 'Created application/children are not readable through officer RLS';
  end if;
  begin
    insert into public.applications(reference_number,applicant_name,village,district,taluk,annual_income,purpose)
    values('SS-2099-99887766','Unauthorized direct insert','Village','District','Taluk',0,'Forbidden');
    raise exception 'Direct application insert was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.applications set status='APPROVED' where id=test_application_id;
    raise exception 'Direct approval update was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.application_events(application_id,event_type,description) values(test_application_id,'FORGED','Forbidden audit write');
    raise exception 'Direct audit insert was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.application_events set description='Forbidden tampering' where application_events.application_id=test_application_id;
    raise exception 'Audit tampering was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform nextval('private.application_intake_reference_seq'::regclass);
    raise exception 'Private reference sequence was accessible';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.application_intake_requests;
    raise exception 'Private receipt table was accessible';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: created case follows officer RLS; direct application/approval/audit writes and private intake access remain denied.';
end;
$$;
reset role;

set local role anon;
do $$
begin
  begin
    perform public.create_application(gen_random_uuid(),'Anonymous applicant','Village',0,'Forbidden');
    raise exception 'Anonymous intake execution was allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: anonymous API role cannot execute application intake.';
end;
$$;
reset role;
rollback;
