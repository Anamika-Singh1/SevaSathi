begin;
do $$
declare actor uuid; app uuid; version integer; result jsonb; before_status public.application_status; events_before integer; test_session uuid:=gen_random_uuid();
begin
  select p.id into actor from public.profiles p join auth.users u on u.id=p.id where u.email='operator@sevasathi.example.com' and p.is_active;
  select a.id,a.status,w.version into app,before_status,version from public.applications a join public.application_workflow w on w.application_id=a.id
  where a.reference_number='SS-2026-0001' and a.is_demo and w.operator_id=actor;
  if app is null or actor is null then raise exception 'Expected disposable seeded demo operator/case'; end if;
  insert into auth.sessions(id,user_id) values(test_session,actor);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',test_session)::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  delete from private.ai_request_windows where officer_id=actor;
  select count(*) into events_before from public.application_events where application_id=app;
  for n in 1..6 loop
    result:=public.reserve_ai_request(app,'screening',version);
    if not (result->>'allowed')::boolean then raise exception 'Expected quota slot %',n; end if;
  end loop;
  result:=public.reserve_ai_request(app,'screening',version);
  if (result->>'allowed')::boolean or (result->>'retry_after')::integer<1 then raise exception 'Quota did not limit the seventh request'; end if;
  begin
    perform public.reserve_ai_request(app,'decision',version);
    raise exception 'Expected role denial';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_ai_request(app,'screening',version+1);
    raise exception 'Expected stale version denial';
  exception when serialization_failure then null; end;
  if (select status from public.applications where id=app)<>before_status
    or (select w.version from public.application_workflow w where application_id=app)<>version
    or (select count(*) from public.application_events where application_id=app)<>events_before then raise exception 'AI quota mutated the workflow or audit log'; end if;
  update private.ai_request_windows set window_started_at=now()-interval '61 seconds' where officer_id=actor;
  if not (public.reserve_ai_request(app,'screening',version)->>'allowed')::boolean then raise exception 'Expired quota did not reset'; end if;
  raise notice 'PASS: persistent per-officer AI quota, role/stage/version denial, expiry and unchanged workflow/history.';
end;
$$;
rollback;
