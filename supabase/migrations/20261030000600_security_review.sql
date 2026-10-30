-- Validate the direct PostgREST RPC as strictly as the Next.js entry point.
-- This does not change stage permissions, transition rules or atomicity.
create function private.validate_workflow_input(input jsonb)
returns void language plpgsql set search_path='' as $$
declare field text; item jsonb;
begin
  if jsonb_typeof(input) is distinct from 'object' then
    raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
  end if;
  foreach field in array array['reason','screening_notes','field_observations','caseworker_notes','visit_date',
    'field_officer_id','caseworker_id','approving_officer_id','verification_status','follow_up_questions','review_issues'] loop
    if input ? field and jsonb_typeof(input->field) is distinct from 'string' then
      raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
    end if;
  end loop;
  foreach field in array array['confirmed','follow_up_resolved','review_issues_resolved'] loop
    if input ? field and jsonb_typeof(input->field) is distinct from 'boolean' then
      raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
    end if;
  end loop;
  foreach field in array array['field_officer_id','caseworker_id','approving_officer_id'] loop
    if input ? field and input->>field<>'' and input->>field !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
    end if;
  end loop;
  if input ? 'visit_date' and input->>'visit_date'<>'' then
    if input->>'visit_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
    end if;
    begin
      perform (input->>'visit_date')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
    end;
  end if;
  foreach field in array array['verification_checks','review_checks'] loop
    if input ? field then
      if jsonb_typeof(input->field) is distinct from 'object' then
        raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
      end if;
      if exists(select 1 from jsonb_each(input->field) check_item where jsonb_typeof(check_item.value)<>'boolean') then
        raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
      end if;
    end if;
  end loop;
  if input ? 'checklist' then
    if jsonb_typeof(input->'checklist') is distinct from 'array' then
      raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
    end if;
    if jsonb_array_length(input->'checklist')>100 then
      raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
    end if;
    for item in select * from jsonb_array_elements(input->'checklist') loop
      if jsonb_typeof(item) is distinct from 'object' then
        raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
      end if;
      if exists(select 1 from jsonb_object_keys(item) item_key where item_key not in ('key','status','note'))
        or jsonb_typeof(item->'key') is distinct from 'string'
        or jsonb_typeof(item->'status') is distinct from 'string'
        or (item ? 'note' and jsonb_typeof(item->'note') is distinct from 'string') then
        raise exception using errcode='22023',message='WORKFLOW_INVALID_INPUT';
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function private.validate_workflow_input(jsonb) from public,anon,authenticated;

-- Preserve the complete existing transaction wrapper, adding input validation
-- before any state changes or idempotency receipt can be returned.
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
  perform private.validate_workflow_input(payload);
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
