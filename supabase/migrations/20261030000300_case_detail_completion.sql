-- Extend the proven transaction engine without granting officer table writes.
alter table public.application_workflow
  add column verification_status text not null default 'PENDING' check (verification_status in ('PENDING','VERIFIED','NEEDS_CLARIFICATION','UNABLE_TO_VERIFY')),
  add column follow_up_questions text not null default '' check (char_length(follow_up_questions)<=4000),
  add column follow_up_resolved boolean not null default false,
  add column review_issues text not null default '' check (char_length(review_issues)<=4000),
  add column review_issues_resolved boolean not null default false,
  add column return_to_stage public.application_status;
update public.application_workflow w set return_to_stage=a.status from public.applications a
where w.application_id=a.id and w.clarification_pending;

alter table public.application_events
  add column sequence bigint generated always as identity,
  add column previous_state jsonb not null default '{}'::jsonb,
  add column new_state jsonb not null default '{}'::jsonb;
create index events_chronological_idx on public.application_events(application_id,created_at,sequence);

create function private.enrich_workflow_history() returns trigger
language plpgsql set search_path='' as $$
declare prior jsonb; following jsonb; input jsonb;
begin
  prior:=nullif(current_setting('sevasathi.previous_state',true),'')::jsonb;
  following:=nullif(current_setting('sevasathi.new_state',true),'')::jsonb;
  input:=nullif(current_setting('sevasathi.workflow_payload',true),'')::jsonb;
  new.previous_state:=coalesce(prior,jsonb_build_object('stage',new.metadata->>'from_status'));
  new.new_state:=coalesce(following,jsonb_build_object('stage',coalesce(new.metadata->>'to_status',new.metadata->>'status')));
  if new.event_type='CHECKLIST_CHANGED' then
    new.previous_state:=new.previous_state || jsonb_build_object('document',new.metadata->>'key','receipt_status',new.metadata->>'before','document_note',new.metadata->>'before_note');
    new.new_state:=new.new_state || jsonb_build_object('document',new.metadata->>'key','receipt_status',new.metadata->>'after','document_note',new.metadata->>'note');
  end if;
  if new.reason is null then
    new.reason:=nullif(btrim(case
      when new.event_type in ('SCREENING_SAVED','DOCUMENT_SCREENED') then input->>'screening_notes'
      when new.event_type in ('FIELD_DRAFT_SAVED','FIELD_REPORT_SUBMITTED') then input->>'field_observations'
      when new.event_type in ('CASEWORKER_REVIEW_SAVED','CASEWORKER_REVIEWED') then input->>'caseworker_notes'
    end),'');
  end if;
  return new;
end;
$$;
create trigger events_enrich_workflow before insert on public.application_events
for each row execute function private.enrich_workflow_history();

-- The private function keeps its name because its qualified parameter references
-- use that name. It cannot be invoked through the API or by authenticated SQL.
alter function public.workflow_action(uuid,text,integer,uuid,jsonb) set schema private;
revoke all on function private.workflow_action(uuid,text,integer,uuid,jsonb) from public,anon,authenticated;

create or replace function public.workflow_action(target_id uuid, action text, expected_version integer, request_id uuid, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype; app public.applications%rowtype;
  work public.application_workflow%rowtype; receipt private.workflow_requests%rowtype;
  original public.application_workflow%rowtype;
  request_fingerprint text:=md5(action || payload::text);
  base_payload jsonb; response jsonb; target public.application_status;
  waiting boolean; before_state jsonb; after_state jsonb; issues text[];
begin
  select * into actor from public.profiles where id=auth.uid() and is_active for share;
  if not found then raise exception using errcode='42501',message='WORKFLOW_FORBIDDEN'; end if;
  select * into app from public.applications where id=target_id for update;
  if not found or not public.can_read_application(target_id) then raise exception using errcode='42501',message='WORKFLOW_FORBIDDEN'; end if;
  select * into work from public.application_workflow where application_id=target_id for update;
  if not found then raise exception using errcode='P0001',message='WORKFLOW_NOT_INITIALIZED'; end if;
  original:=work;
  if request_id is null or expected_version is null or jsonb_typeof(payload) is distinct from 'object' then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
  select * into receipt from private.workflow_requests r where r.application_id=target_id and r.request_id=workflow_action.request_id;
  if found then
    if receipt.actor_id<>actor.id or receipt.fingerprint<>request_fingerprint then raise exception using errcode='22023',message='WORKFLOW_REQUEST_REUSED'; end if;
    return receipt.result || '{"duplicate":true}'::jsonb;
  end if;
  if app.status in ('APPROVED','REJECTED') then raise exception using errcode='P0001',message='WORKFLOW_CLOSED'; end if;
  if work.version<>expected_version then raise exception using errcode='40001',message='WORKFLOW_STALE'; end if;
  if app.status<>'FIELD_VERIFICATION' and payload ?| array['verification_status','follow_up_questions','follow_up_resolved']
    or app.status<>'UNDER_REVIEW' and payload ?| array['review_issues','review_issues_resolved'] then
    raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
  end if;
  if app.status='FIELD_VERIFICATION' then
    if payload ? 'verification_status' then
      if jsonb_typeof(payload->'verification_status') is distinct from 'string' or payload->>'verification_status' not in ('PENDING','VERIFIED','NEEDS_CLARIFICATION','UNABLE_TO_VERIFY') then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
      work.verification_status:=payload->>'verification_status';
    end if;
    if payload ? 'follow_up_questions' then
      if jsonb_typeof(payload->'follow_up_questions') is distinct from 'string' or char_length(payload->>'follow_up_questions')>4000 then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
      work.follow_up_questions:=btrim(payload->>'follow_up_questions');
    end if;
    if payload ? 'follow_up_resolved' then
      if jsonb_typeof(payload->'follow_up_resolved') is distinct from 'boolean' then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
      work.follow_up_resolved:=(payload->>'follow_up_resolved')::boolean;
    end if;
    if action in ('ADVANCE','RESUME') and (work.verification_status<>'VERIFIED' or work.follow_up_questions<>'' and not work.follow_up_resolved) then raise exception using errcode='22023',message='WORKFLOW_FIELD_UNRESOLVED'; end if;
  elsif app.status='UNDER_REVIEW' then
    if payload ? 'review_issues' then
      if jsonb_typeof(payload->'review_issues') is distinct from 'string' or char_length(payload->>'review_issues')>4000 then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
      work.review_issues:=btrim(payload->>'review_issues');
    end if;
    if payload ? 'review_issues_resolved' then
      if jsonb_typeof(payload->'review_issues_resolved') is distinct from 'boolean' then raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT'; end if;
      work.review_issues_resolved:=(payload->>'review_issues_resolved')::boolean;
    end if;
    if action in ('ADVANCE','RESUME') and work.review_issues<>'' and not work.review_issues_resolved then raise exception using errcode='22023',message='WORKFLOW_REVIEW_UNRESOLVED'; end if;
  end if;
  target:=app.status; waiting:=work.clarification_pending;
  if action='RETURN' then
    target:=case app.status when 'SUBMITTED' then 'SUBMITTED' when 'FIELD_VERIFICATION' then 'SUBMITTED' when 'UNDER_REVIEW' then 'FIELD_VERIFICATION' else 'UNDER_REVIEW' end;
    if app.status<>'SUBMITTED' and (work.screened_at is null or app.assigned_field_officer_id is null) then target:='SUBMITTED'; end if;
    waiting:=true;
    work.review_issues_resolved:=false;
    if target in ('SUBMITTED','FIELD_VERIFICATION') then work.verification_status:='PENDING'; work.follow_up_resolved:=false; end if;
  elsif action='RESUME' then target:=work.resume_status; waiting:=jsonb_array_length(work.return_stack)>0;
  elsif action='ADVANCE' then target:=(case app.status when 'SUBMITTED' then 'FIELD_VERIFICATION' when 'FIELD_VERIFICATION' then 'UNDER_REVIEW' else 'PENDING_APPROVAL' end)::public.application_status;
  elsif action in ('APPROVE','REJECT') then target:=(case action when 'APPROVE' then 'APPROVED' else 'REJECTED' end)::public.application_status;
  end if;
  before_state:=jsonb_build_object('stage',app.status,'version',original.version,'clarification_pending',original.clarification_pending,
    'return_to_stage',original.return_to_stage,'verification_status',original.verification_status,'follow_up_questions',original.follow_up_questions,
    'follow_up_resolved',original.follow_up_resolved,'review_issues',original.review_issues,'review_issues_resolved',original.review_issues_resolved);
  after_state:=jsonb_build_object('stage',target,'version',original.version+1,'clarification_pending',waiting,
    'return_to_stage',case when waiting then target end,'verification_status',work.verification_status,'follow_up_questions',work.follow_up_questions,
    'follow_up_resolved',work.follow_up_resolved,'review_issues',work.review_issues,'review_issues_resolved',work.review_issues_resolved);
  perform set_config('sevasathi.previous_state',before_state::text,true);
  perform set_config('sevasathi.new_state',after_state::text,true);
  perform set_config('sevasathi.workflow_payload',payload::text,true);
  update public.application_workflow set verification_status=work.verification_status,follow_up_questions=work.follow_up_questions,
    follow_up_resolved=work.follow_up_resolved,review_issues=work.review_issues,review_issues_resolved=work.review_issues_resolved,
    return_to_stage=case when waiting then target end where application_id=target_id;
  base_payload:=payload-array['verification_status','follow_up_questions','follow_up_resolved','review_issues','review_issues_resolved'];
  -- All original role, assignment, prerequisites, confirmation and transition
  -- validation remains in the same transaction. Any exception rolls back above.
  response:=private.workflow_action(target_id,action,expected_version,request_id,base_payload);
  select * into app from public.applications where id=target_id;
  issues:=array_remove(array_remove(app.unresolved_actions,nullif(original.follow_up_questions,'')),nullif(original.review_issues,''));
  if app.status not in ('APPROVED','REJECTED') then
    if work.follow_up_questions<>'' and not work.follow_up_resolved then issues:=array_append(issues,work.follow_up_questions); end if;
    if work.review_issues<>'' and not work.review_issues_resolved then issues:=array_append(issues,work.review_issues); end if;
  end if;
  update public.applications set unresolved_actions=(select coalesce(array_agg(distinct x),'{}') from unnest(issues) x) where id=target_id;
  response:=response || jsonb_build_object('return_to_stage',case when waiting then target end);
  update private.workflow_requests r set fingerprint=request_fingerprint,result=response where r.application_id=target_id and r.request_id=workflow_action.request_id;
  return response;
end;
$$;
revoke all on function public.workflow_action(uuid,text,integer,uuid,jsonb) from public,anon;
grant execute on function public.workflow_action(uuid,text,integer,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
