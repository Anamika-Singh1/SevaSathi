-- A shared per-officer quota survives application restarts and multiple servers.
-- No workflow state, case content, prompts or provider responses are stored here.
create table private.ai_request_windows (
  officer_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  requests integer not null default 0 check(requests>=0)
);
revoke all on private.ai_request_windows from public,anon,authenticated;

create function public.reserve_ai_request(target_id uuid,feature text,expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; app public.applications%rowtype; work public.application_workflow%rowtype;
  budget private.ai_request_windows%rowtype; assigned uuid; valid_stage boolean;
begin
  select * into actor from public.profiles where id=auth.uid() and is_active for share;
  if not found then raise exception using errcode='42501',message='AI_FORBIDDEN'; end if;
  select * into app from public.applications where id=target_id for share;
  if not found or not public.can_read_application(target_id) then raise exception using errcode='42501',message='AI_FORBIDDEN'; end if;
  select * into work from public.application_workflow where application_id=target_id for share;
  if not found then raise exception using errcode='42501',message='AI_FORBIDDEN'; end if;
  assigned:=case feature when 'screening' then work.operator_id when 'field' then app.assigned_field_officer_id when 'review' then work.caseworker_id when 'decision' then work.approving_officer_id end;
  valid_stage:=case feature
    when 'screening' then actor.role='OPERATOR' and app.status='SUBMITTED'
    when 'field' then actor.role='FIELD_OFFICER' and app.status='FIELD_VERIFICATION'
    when 'review' then actor.role='CASEWORKER' and app.status='UNDER_REVIEW'
    when 'decision' then actor.role='APPROVING_OFFICER' and app.status in ('PENDING_APPROVAL','APPROVED','REJECTED')
    else false end;
  if assigned is distinct from actor.id or not coalesce(valid_stage,false) then raise exception using errcode='42501',message='AI_FORBIDDEN'; end if;
  if expected_version is null or work.version<>expected_version then raise exception using errcode='40001',message='AI_STALE_CONTEXT'; end if;
  insert into private.ai_request_windows(officer_id) values(actor.id) on conflict do nothing;
  select * into budget from private.ai_request_windows where officer_id=actor.id for update;
  if budget.window_started_at<=now()-interval '60 seconds' then budget.window_started_at:=now();budget.requests:=0;end if;
  if budget.requests>=6 then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from budget.window_started_at+interval '60 seconds'-now()))::integer));end if;
  update private.ai_request_windows set window_started_at=budget.window_started_at,requests=budget.requests+1 where officer_id=actor.id;
  return jsonb_build_object('allowed',true,'retry_after',0);
end;
$$;
revoke all on function public.reserve_ai_request(uuid,text,integer) from public,anon;
grant execute on function public.reserve_ai_request(uuid,text,integer) to authenticated;
notify pgrst,'reload schema';
