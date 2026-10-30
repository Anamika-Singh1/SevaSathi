-- All officer mutations go through workflow_action; no direct write grants.
create table public.application_workflow (
  application_id uuid primary key references public.applications(id) on delete cascade,
  operator_id uuid references public.profiles(id),
  caseworker_id uuid references public.profiles(id),
  approving_officer_id uuid references public.profiles(id),
  version integer not null default 0 check (version >= 0),
  screening_notes text not null default '' check (char_length(screening_notes) <= 4000),
  screened_at timestamptz,
  visit_date date,
  field_observations text not null default '' check (char_length(field_observations) <= 4000),
  verification_checks jsonb not null default '{"identity_confirmed":false,"residence_confirmed":false,"income_assessed":false}',
  field_submitted_at timestamptz,
  caseworker_notes text not null default '' check (char_length(caseworker_notes) <= 4000),
  review_checks jsonb not null default '{"documents_reviewed":false,"field_report_reviewed":false,"income_reviewed":false}',
  review_submitted_at timestamptz,
  clarification_pending boolean not null default false,
  resume_status public.application_status,
  return_stack jsonb not null default '[]'::jsonb,
  return_reason text,
  returned_by uuid references public.profiles(id),
  returned_at timestamptz,
  decision_reason text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  check (clarification_pending = (resume_status is not null))
);

create table public.application_checklist (
  application_id uuid not null references public.applications(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 100),
  label_kn text not null,
  label_en text not null,
  required boolean not null default true,
  receipt_status text not null default 'MISSING' check (receipt_status in ('RECEIVED','MISSING','CLARIFICATION_NEEDED')),
  note text not null default '' check (char_length(note) <= 1000),
  primary key (application_id, key)
);
comment on table public.application_checklist is 'Administrator-configurable screening checklist. Initial rows are demonstration requirements, not an official government document list. Receipt is a manual officer declaration, not file verification.';

alter table public.application_workflow enable row level security;
alter table public.application_checklist enable row level security;
create policy workflow_read_scoped on public.application_workflow for select to authenticated
using (public.can_read_application(application_id));
create policy checklist_read_scoped on public.application_checklist for select to authenticated
using (public.can_read_application(application_id));
revoke all on public.application_workflow, public.application_checklist from public, anon, authenticated;
grant select on public.application_workflow, public.application_checklist to authenticated;
grant all on public.application_workflow, public.application_checklist to service_role;

create function private.initialize_workflow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.application_workflow(application_id, operator_id, caseworker_id, approving_officer_id)
  values (new.id,
    (select p.id from public.profiles p where p.is_active and p.role = 'OPERATOR' and p.district = new.district and p.taluk = new.taluk order by (p.id = new.created_by) desc, p.created_at, p.id limit 1),
    (select p.id from public.profiles p where p.is_active and p.role = 'CASEWORKER' and p.district = new.district and p.taluk = new.taluk order by p.created_at, p.id limit 1),
    (select p.id from public.profiles p where p.is_active and p.role = 'APPROVING_OFFICER' and p.district = new.district and p.taluk = new.taluk order by p.created_at, p.id limit 1));
  insert into public.application_checklist(application_id,key,label_kn,label_en) values
    (new.id,'income_declaration','ಆದಾಯ ಘೋಷಣೆ','Income declaration'),
    (new.id,'identity_proof','ಗುರುತಿನ ದಾಖಲೆ','Identity proof'),
    (new.id,'residence_proof','ನಿವಾಸದ ದಾಖಲೆ','Residence proof');
  return new;
end;
$$;
create trigger applications_workflow after insert on public.applications
for each row execute function private.initialize_workflow();

-- Existing cases keep their stages and content; no historical sign-offs are invented.
insert into public.application_workflow(application_id,operator_id,caseworker_id,approving_officer_id)
select a.id,
  (select p.id from public.profiles p where p.is_active and p.role='OPERATOR' and p.district=a.district and p.taluk=a.taluk order by (p.id=a.created_by) desc,p.created_at,p.id limit 1),
  (select p.id from public.profiles p where p.is_active and p.role='CASEWORKER' and p.district=a.district and p.taluk=a.taluk order by p.created_at,p.id limit 1),
  (select p.id from public.profiles p where p.is_active and p.role='APPROVING_OFFICER' and p.district=a.district and p.taluk=a.taluk order by p.created_at,p.id limit 1)
from public.applications a;
insert into public.application_checklist(application_id,key,label_kn,label_en)
select a.id,c.key,c.kn,c.en from public.applications a cross join (values
  ('income_declaration','ಆದಾಯ ಘೋಷಣೆ','Income declaration'),
  ('identity_proof','ಗುರುತಿನ ದಾಖಲೆ','Identity proof'),
  ('residence_proof','ನಿವಾಸದ ದಾಖಲೆ','Residence proof')
) c(key,kn,en);

alter table public.application_events
  add column actor_name text not null default 'ವ್ಯವಸ್ಥೆ / System',
  add column actor_role text not null default 'SYSTEM',
  add column reason text,
  add column request_id uuid;
-- Old records only receive a known profile snapshot. Unknown historical roles
-- are labeled LEGACY_UNKNOWN rather than inventing who performed the action.
update public.application_events e set actor_name=p.full_name, actor_role=p.role::text
from public.profiles p where p.id=e.actor_id;
update public.application_events set actor_role='LEGACY_UNKNOWN',actor_name='ಹಿಂದಿನ ಅಧಿಕಾರಿ / Historical officer'
where actor_id is not null and actor_role='SYSTEM';
alter table public.application_events drop constraint application_events_actor_id_fkey;

create function private.preserve_audit() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- A trusted deletion of a disposable application may cascade its history.
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  raise exception using errcode='42501', message='AUDIT_IMMUTABLE';
end;
$$;
create trigger events_append_only before update or delete on public.application_events
for each row execute function private.preserve_audit();

create or replace function private.audit_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid();
  if tg_op='INSERT' or new.status is distinct from old.status or new.assigned_field_officer_id is distinct from old.assigned_field_officer_id then
    insert into public.application_events(application_id,actor_id,actor_name,actor_role,event_type,description,reason,request_id,metadata)
    values (new.id,auth.uid(),coalesce(actor.full_name,'ವ್ಯವಸ್ಥೆ / System'),coalesce(actor.role::text,'SYSTEM'),
      case when tg_op='INSERT' then 'APPLICATION_CREATED' when new.status is distinct from old.status then 'STAGE_CHANGED' else 'OFFICER_ASSIGNED' end,
      case when tg_op='INSERT' then 'ಅರ್ಜಿ ದಾಖಲಾಗಿದೆ / Application registered' when new.status is distinct from old.status then 'ಹಂತ ಬದಲಾವಣೆ / Stage changed' else 'ಅಧಿಕಾರಿ ನಿಯೋಜನೆ / Officer assigned' end,
      nullif(current_setting('sevasathi.workflow_reason',true),''),
      nullif(current_setting('sevasathi.workflow_request_id',true),'')::uuid,
      jsonb_build_object('from_status',case when tg_op='UPDATE' then old.status end,'to_status',new.status,'assigned_field_officer_id',new.assigned_field_officer_id));
  end if;
  return new;
end;
$$;

create table private.workflow_requests (
  application_id uuid not null references public.applications(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  fingerprint text not null,
  result jsonb not null,
  primary key (application_id,request_id)
);
revoke all on private.workflow_requests from public,anon,authenticated;

create function public.workflow_officers(target_id uuid)
returns table(id uuid,full_name text,role public.officer_role)
language sql stable security definer set search_path='' as $$
  select p.id,p.full_name,p.role from public.profiles p
  join public.applications a on a.district=p.district and a.taluk=p.taluk
  where a.id=target_id and p.is_active and public.can_read_application(a.id)
    and p.role in ('OPERATOR','FIELD_OFFICER','CASEWORKER','APPROVING_OFFICER')
  order by p.role,p.full_name,p.id;
$$;
revoke all on function public.workflow_officers(uuid) from public,anon;
grant execute on function public.workflow_officers(uuid) to authenticated,service_role;

create or replace function public.workflow_action(target_id uuid, action text, expected_version integer, request_id uuid, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  app public.applications%rowtype;
  work public.application_workflow%rowtype;
  receipt private.workflow_requests%rowtype;
  item jsonb;
  prior public.application_checklist%rowtype;
  allowed text[];
  owner_id uuid;
  required_role public.officer_role;
  target public.application_status;
  event_action text;
  note_reason text;
  result jsonb;
  fingerprint text := md5(action || payload::text);
  outer_return jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='WORKFLOW_FORBIDDEN'; end if;
  select * into actor from public.profiles where id=auth.uid() and is_active for share;
  if not found then raise exception using errcode='42501',message='WORKFLOW_FORBIDDEN'; end if;
  select * into app from public.applications where id=target_id for update;
  if not found or not public.can_read_application(target_id) then raise exception using errcode='42501',message='WORKFLOW_FORBIDDEN'; end if;
  select * into work from public.application_workflow where application_id=target_id for update;
  if not found then raise exception using errcode='P0001',message='WORKFLOW_NOT_INITIALIZED'; end if;
  if request_id is null or expected_version is null or jsonb_typeof(payload) is distinct from 'object' then
    raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
  end if;
  select * into receipt from private.workflow_requests r where r.application_id=target_id and r.request_id=workflow_action.request_id;
  if found then
    if receipt.actor_id<>actor.id or receipt.fingerprint<>fingerprint then raise exception using errcode='22023',message='WORKFLOW_REQUEST_REUSED'; end if;
    return receipt.result || '{"duplicate":true}'::jsonb;
  end if;
  if app.status in ('APPROVED','REJECTED') then raise exception using errcode='P0001',message='WORKFLOW_CLOSED'; end if;
  required_role := case app.status when 'SUBMITTED' then 'OPERATOR' when 'FIELD_VERIFICATION' then 'FIELD_OFFICER' when 'UNDER_REVIEW' then 'CASEWORKER' else 'APPROVING_OFFICER' end;
  owner_id := case app.status when 'SUBMITTED' then work.operator_id when 'FIELD_VERIFICATION' then app.assigned_field_officer_id when 'UNDER_REVIEW' then work.caseworker_id else work.approving_officer_id end;
  if actor.role<>required_role or owner_id is distinct from actor.id then raise exception using errcode='42501',message='WORKFLOW_NOT_ASSIGNED'; end if;
  if work.version<>expected_version then raise exception using errcode='40001',message='WORKFLOW_STALE'; end if;
  if action not in ('SAVE','ADVANCE','RETURN','RESUME','APPROVE','REJECT') or action is null then raise exception using errcode='22023',message='WORKFLOW_INVALID_ACTION'; end if;
  if work.clarification_pending and (action not in ('SAVE','RESUME','RETURN') or (action='RETURN' and app.status='SUBMITTED')) then raise exception using errcode='P0001',message='WORKFLOW_RESUME_REQUIRED'; end if;
  if action='RESUME' and not work.clarification_pending then raise exception using errcode='P0001',message='WORKFLOW_NOT_RETURNED'; end if;
  if action in ('APPROVE','REJECT') and app.status<>'PENDING_APPROVAL' then raise exception using errcode='42501',message='WORKFLOW_INVALID_TRANSITION'; end if;
  if app.status='PENDING_APPROVAL' and action not in ('APPROVE','REJECT','RETURN') then raise exception using errcode='42501',message='WORKFLOW_INVALID_TRANSITION'; end if;
  allowed := case app.status
    when 'SUBMITTED' then array['screening_notes','checklist','field_officer_id','caseworker_id','approving_officer_id','reason','confirmed']
    when 'FIELD_VERIFICATION' then array['visit_date','field_observations','verification_checks','reason','confirmed']
    when 'UNDER_REVIEW' then array['caseworker_notes','review_checks','reason','confirmed']
    else array['reason','confirmed'] end;
  if exists(select 1 from jsonb_object_keys(payload) k where not k=any(allowed)) then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
  note_reason := nullif(btrim(payload->>'reason'),'');
  if char_length(coalesce(note_reason,''))>4000 then raise exception using errcode='22023',message='WORKFLOW_REASON_TOO_LONG'; end if;
  if action in ('RETURN','RESUME','REJECT') and char_length(coalesce(note_reason,''))<5 then raise exception using errcode='22023',message='WORKFLOW_REASON_REQUIRED'; end if;
  if app.status='PENDING_APPROVAL' and payload->'confirmed' is distinct from 'true'::jsonb then raise exception using errcode='22023',message='WORKFLOW_CONFIRM_REQUIRED'; end if;
  perform set_config('sevasathi.workflow_reason',coalesce(note_reason,''),true);
  perform set_config('sevasathi.workflow_request_id',request_id::text,true);

  if app.status='SUBMITTED' then
    if payload ? 'screening_notes' then
      if jsonb_typeof(payload->'screening_notes')<>'string' then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
      work.screening_notes := btrim(payload->>'screening_notes');
    end if;
    if payload ? 'checklist' then
      if jsonb_typeof(payload->'checklist')<>'array' or jsonb_array_length(payload->'checklist')>100 then raise exception using errcode='22023',message='WORKFLOW_INVALID_CHECKLIST'; end if;
      if (select count(*) from jsonb_array_elements(payload->'checklist')) <> (select count(distinct x->>'key') from jsonb_array_elements(payload->'checklist') x) then raise exception using errcode='22023',message='WORKFLOW_INVALID_CHECKLIST'; end if;
      for item in select * from jsonb_array_elements(payload->'checklist') loop
        select * into prior from public.application_checklist c where c.application_id=target_id and c.key=item->>'key';
        if not found or item->>'status' not in ('RECEIVED','MISSING','CLARIFICATION_NEEDED') or item->>'status' is null
          or char_length(coalesce(item->>'note',''))>1000 then raise exception using errcode='22023',message='WORKFLOW_INVALID_CHECKLIST'; end if;
        if prior.receipt_status is distinct from item->>'status' or prior.note is distinct from coalesce(item->>'note','') then
          update public.application_checklist set receipt_status=item->>'status',note=coalesce(item->>'note','') where application_id=target_id and key=prior.key;
          insert into public.application_events(application_id,actor_id,actor_name,actor_role,event_type,description,reason,request_id,metadata)
          values(target_id,actor.id,actor.full_name,actor.role::text,'CHECKLIST_CHANGED','ದಾಖಲೆ ಸ್ಥಿತಿ ಬದಲಾವಣೆ / Checklist changed',note_reason,request_id,
            jsonb_build_object('key',prior.key,'label_kn',prior.label_kn,'before',prior.receipt_status,'after',item->>'status','before_note',prior.note,'note',coalesce(item->>'note','')));
        end if;
      end loop;
    end if;
    if payload ? 'field_officer_id' then app.assigned_field_officer_id:=nullif(payload->>'field_officer_id','')::uuid; end if;
    if payload ? 'caseworker_id' then work.caseworker_id:=nullif(payload->>'caseworker_id','')::uuid; end if;
    if payload ? 'approving_officer_id' then work.approving_officer_id:=nullif(payload->>'approving_officer_id','')::uuid; end if;
    if (app.assigned_field_officer_id is not null and not exists(select 1 from public.profiles p where p.id=app.assigned_field_officer_id and p.is_active and p.role='FIELD_OFFICER' and p.district=app.district and p.taluk=app.taluk))
      or (work.caseworker_id is not null and not exists(select 1 from public.profiles p where p.id=work.caseworker_id and p.is_active and p.role='CASEWORKER' and p.district=app.district and p.taluk=app.taluk))
      or (work.approving_officer_id is not null and not exists(select 1 from public.profiles p where p.id=work.approving_officer_id and p.is_active and p.role='APPROVING_OFFICER' and p.district=app.district and p.taluk=app.taluk)) then
      raise exception using errcode='22023',message='WORKFLOW_INVALID_ASSIGNMENT';
    end if;
  elsif app.status='FIELD_VERIFICATION' then
    if payload ? 'visit_date' then work.visit_date:=nullif(payload->>'visit_date','')::date; end if;
    if payload ? 'field_observations' then
      if jsonb_typeof(payload->'field_observations')<>'string' then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
      work.field_observations:=btrim(payload->>'field_observations');
    end if;
    if payload ? 'verification_checks' then
      if jsonb_typeof(payload->'verification_checks')<>'object' or exists(select 1 from jsonb_each(payload->'verification_checks') c where c.key not in ('identity_confirmed','residence_confirmed','income_assessed') or jsonb_typeof(c.value)<>'boolean') then raise exception using errcode='22023',message='WORKFLOW_INVALID_CHECKLIST'; end if;
      work.verification_checks:=work.verification_checks || (payload->'verification_checks');
    end if;
  elsif app.status='UNDER_REVIEW' then
    if payload ? 'caseworker_notes' then
      if jsonb_typeof(payload->'caseworker_notes')<>'string' then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
      work.caseworker_notes:=btrim(payload->>'caseworker_notes');
    end if;
    if payload ? 'review_checks' then
      if jsonb_typeof(payload->'review_checks')<>'object' or exists(select 1 from jsonb_each(payload->'review_checks') c where c.key not in ('documents_reviewed','field_report_reviewed','income_reviewed') or jsonb_typeof(c.value)<>'boolean') then raise exception using errcode='22023',message='WORKFLOW_INVALID_CHECKLIST'; end if;
      work.review_checks:=work.review_checks || (payload->'review_checks');
    end if;
  end if;
  if greatest(char_length(work.screening_notes),char_length(work.field_observations),char_length(work.caseworker_notes))>4000 then raise exception using errcode='22023',message='WORKFLOW_NOTES_TOO_LONG'; end if;

  -- Requirements are checked inside the transaction, including when resuming.
  if action in ('ADVANCE','RESUME') then
    if app.status='SUBMITTED' and (
      char_length(work.screening_notes)<5 or app.assigned_field_officer_id is null or work.caseworker_id is null or work.approving_officer_id is null
      or not exists(select 1 from public.application_checklist c where c.application_id=target_id and c.required)
      or exists(select 1 from public.application_checklist c where c.application_id=target_id and c.required and c.receipt_status<>'RECEIVED')) then
      raise exception using errcode='22023',message='WORKFLOW_SCREENING_INCOMPLETE';
    elsif app.status='FIELD_VERIFICATION' and (work.screened_at is null or work.visit_date is null
      or work.visit_date>(now() at time zone 'Asia/Kolkata')::date or work.visit_date<(app.submitted_at at time zone 'Asia/Kolkata')::date
      or char_length(work.field_observations)<5 or work.verification_checks<>'{"identity_confirmed":true,"residence_confirmed":true,"income_assessed":true}'::jsonb) then
      raise exception using errcode='22023',message='WORKFLOW_FIELD_INCOMPLETE';
    elsif app.status='UNDER_REVIEW' and (work.field_submitted_at is null or char_length(work.caseworker_notes)<5
      or work.review_checks<>'{"documents_reviewed":true,"field_report_reviewed":true,"income_reviewed":true}'::jsonb) then
      raise exception using errcode='22023',message='WORKFLOW_REVIEW_INCOMPLETE';
    end if;
  end if;
  if action in ('APPROVE','REJECT') and (work.screened_at is null or work.field_submitted_at is null or work.review_submitted_at is null) then
    raise exception using errcode='22023',message='WORKFLOW_REVIEW_INCOMPLETE';
  end if;

  if action='RETURN' then
    if work.clarification_pending then
      work.return_stack:=work.return_stack || jsonb_build_array(jsonb_build_object('resume_status',work.resume_status,'reason',work.return_reason,'returned_by',work.returned_by,'returned_at',work.returned_at));
    end if;
    target:=case app.status when 'SUBMITTED' then 'SUBMITTED' when 'FIELD_VERIFICATION' then 'SUBMITTED' when 'UNDER_REVIEW' then 'FIELD_VERIFICATION' else 'UNDER_REVIEW' end;
    work.clarification_pending:=true; work.resume_status:=app.status;
    -- Imported Phase 1/2 cases have no manual sign-offs. A return routes them
    -- through screening and the entire manual chain instead of inventing them.
    if app.status<>'SUBMITTED' and (work.screened_at is null or app.assigned_field_officer_id is null) then
      target:='SUBMITTED'; work.resume_status:='FIELD_VERIFICATION'; work.return_stack:='[]'::jsonb;
    end if;
    work.return_reason:=note_reason; work.returned_by:=actor.id; work.returned_at:=now();
    -- Previous notes remain as drafts, but corrected evidence requires new sign-offs.
    work.review_submitted_at:=null;
    work.review_checks:='{"documents_reviewed":false,"field_report_reviewed":false,"income_reviewed":false}'::jsonb;
    if target in ('SUBMITTED','FIELD_VERIFICATION') then
      work.field_submitted_at:=null;
      work.verification_checks:='{"identity_confirmed":false,"residence_confirmed":false,"income_assessed":false}'::jsonb;
    end if;
    if target='SUBMITTED' then work.screened_at:=null; end if;
    app.unresolved_actions:=array[note_reason];
    event_action:='RETURNED_FOR_CLARIFICATION';
  elsif action in ('ADVANCE','RESUME') then
    target:=(case when action='RESUME' then work.resume_status::text else case app.status when 'SUBMITTED' then 'FIELD_VERIFICATION' when 'FIELD_VERIFICATION' then 'UNDER_REVIEW' else 'PENDING_APPROVAL' end end)::public.application_status;
    work.clarification_pending:=false; work.resume_status:=null;
    app.unresolved_actions:='{}';
    if action='RESUME' and jsonb_array_length(work.return_stack)>0 then
      outer_return:=work.return_stack->-1;
      work.return_stack:=work.return_stack-(jsonb_array_length(work.return_stack)-1);
      work.clarification_pending:=true;
      work.resume_status:=(outer_return->>'resume_status')::public.application_status;
      work.return_reason:=outer_return->>'reason';
      work.returned_by:=(outer_return->>'returned_by')::uuid;
      work.returned_at:=(outer_return->>'returned_at')::timestamptz;
      app.unresolved_actions:=array[work.return_reason];
    end if;
    if app.status='SUBMITTED' then work.screened_at:=now(); event_action:='DOCUMENT_SCREENED';
    elsif app.status='FIELD_VERIFICATION' then work.field_submitted_at:=now(); app.field_report:=work.field_observations; event_action:='FIELD_REPORT_SUBMITTED';
    else work.review_submitted_at:=now(); event_action:='CASEWORKER_REVIEWED'; end if;
    if action='RESUME' then
      insert into public.application_events(application_id,actor_id,actor_name,actor_role,event_type,description,reason,request_id,metadata)
      values(target_id,actor.id,actor.full_name,actor.role::text,'APPLICATION_RESUMED','ಸ್ಪಷ್ಟೀಕರಣದ ನಂತರ ಪುನರಾರಂಭ / Application resumed',note_reason,request_id,jsonb_build_object('from_status',app.status,'to_status',target));
    end if;
  elsif action in ('APPROVE','REJECT') then
    target:=case when action='APPROVE' then 'APPROVED' else 'REJECTED' end;
    work.decision_reason:=note_reason; work.decided_by:=actor.id; work.decided_at:=now();
    app.unresolved_actions:='{}'; event_action:=target::text;
  else
    target:=app.status;
    event_action:=case app.status when 'SUBMITTED' then 'SCREENING_SAVED' when 'FIELD_VERIFICATION' then 'FIELD_DRAFT_SAVED' else 'CASEWORKER_REVIEW_SAVED' end;
  end if;

  update public.applications set status=target,assigned_field_officer_id=app.assigned_field_officer_id,field_report=app.field_report,unresolved_actions=app.unresolved_actions where id=target_id;
  work.version:=work.version+1;
  update public.application_workflow set operator_id=work.operator_id,caseworker_id=work.caseworker_id,approving_officer_id=work.approving_officer_id,
    version=work.version,screening_notes=work.screening_notes,screened_at=work.screened_at,visit_date=work.visit_date,
    field_observations=work.field_observations,verification_checks=work.verification_checks,field_submitted_at=work.field_submitted_at,
    caseworker_notes=work.caseworker_notes,review_checks=work.review_checks,review_submitted_at=work.review_submitted_at,
    clarification_pending=work.clarification_pending,resume_status=work.resume_status,return_stack=work.return_stack,return_reason=work.return_reason,
    returned_by=work.returned_by,returned_at=work.returned_at,decision_reason=work.decision_reason,decided_by=work.decided_by,decided_at=work.decided_at,updated_at=now()
  where application_id=target_id;
  insert into public.application_events(application_id,actor_id,actor_name,actor_role,event_type,description,reason,request_id,metadata)
  values(target_id,actor.id,actor.full_name,actor.role::text,event_action,
    case event_action when 'SCREENING_SAVED' then 'ದಾಖಲೆ ಪರಿಶೀಲನೆ ಉಳಿಸಲಾಗಿದೆ / Screening progress saved'
      when 'DOCUMENT_SCREENED' then 'ದಾಖಲೆ ಪರಿಶೀಲನೆ ಪೂರ್ಣ / Documents screened'
      when 'FIELD_DRAFT_SAVED' then 'ಕ್ಷೇತ್ರ ವರದಿ ಕರಡು ಉಳಿಸಲಾಗಿದೆ / Field draft saved'
      when 'FIELD_REPORT_SUBMITTED' then 'ಕ್ಷೇತ್ರ ವರದಿ ಸಲ್ಲಿಸಲಾಗಿದೆ / Field report submitted'
      when 'CASEWORKER_REVIEW_SAVED' then 'ಪ್ರಕರಣ ಪರಿಶೀಲನೆ ಉಳಿಸಲಾಗಿದೆ / Review progress saved'
      when 'CASEWORKER_REVIEWED' then 'ಪ್ರಕರಣ ಪರಿಶೀಲನೆ ಪೂರ್ಣ / Caseworker review completed'
      when 'RETURNED_FOR_CLARIFICATION' then 'ಸ್ಪಷ್ಟೀಕರಣಕ್ಕಾಗಿ ಹಿಂತಿರುಗಿಸಲಾಗಿದೆ / Returned for clarification'
      when 'APPROVED' then 'ಅರ್ಜಿ ಅನುಮೋದಿಸಲಾಗಿದೆ / Application approved'
      else 'ಅರ್ಜಿ ತಿರಸ್ಕೃತ / Application rejected' end,
    note_reason,request_id,jsonb_build_object('from_status',app.status,'to_status',target,'version',work.version,
      'screening_notes',case when app.status='SUBMITTED' then work.screening_notes end,
      'visit_date',case when app.status='FIELD_VERIFICATION' then work.visit_date end,
      'observations',case when app.status='FIELD_VERIFICATION' then work.field_observations end,
      'verification_checks',case when app.status='FIELD_VERIFICATION' then work.verification_checks end,
      'caseworker_notes',case when app.status='UNDER_REVIEW' then work.caseworker_notes end,
      'review_checks',case when app.status='UNDER_REVIEW' then work.review_checks end,
      'operator_id',work.operator_id,'field_officer_id',app.assigned_field_officer_id,'caseworker_id',work.caseworker_id,'approving_officer_id',work.approving_officer_id));
  result:=jsonb_build_object('version',work.version,'status',target,'clarification_pending',work.clarification_pending,'duplicate',false);
  insert into private.workflow_requests(application_id,request_id,actor_id,fingerprint,result) values(target_id,request_id,actor.id,fingerprint,result);
  return result;
end;
$$;
revoke all on function public.workflow_action(uuid,text,integer,uuid,jsonb) from public,anon;
grant execute on function public.workflow_action(uuid,text,integer,uuid,jsonb) to authenticated;

-- Preserve Phase 2's caller-rights read model and append workflow state.
alter view public.application_worklist rename to application_worklist_base;
create view public.application_worklist with (security_invoker=true) as
select b.*,w.clarification_pending,w.resume_status,w.version as workflow_version
from public.application_worklist_base b join public.application_workflow w on w.application_id=b.id;
revoke all on public.application_worklist from public,anon,authenticated;
grant select on public.application_worklist to authenticated,service_role;
notify pgrst,'reload schema';
