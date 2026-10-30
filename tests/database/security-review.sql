begin read only;
do $$
declare target regclass; permission text; proc regprocedure; item record;
begin
  foreach target in array array['public.profiles'::regclass,'public.applications'::regclass,
    'public.application_documents'::regclass,'public.application_notes'::regclass,'public.application_events'::regclass,
    'public.application_workflow'::regclass,'public.application_checklist'::regclass,'public.workflow_demo_settings'::regclass] loop
    if not (select relrowsecurity from pg_class where oid=target) then raise exception 'RLS disabled on %',target; end if;
    if not has_table_privilege('authenticated',target,'SELECT') then raise exception 'Missing officer read grant on %',target; end if;
    foreach permission in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated',target,permission) or has_table_privilege('anon',target,permission) then
        raise exception 'Direct untrusted % grant on %',permission,target;
      end if;
    end loop;
    if has_table_privilege('anon',target,'SELECT') then raise exception 'Anonymous table read grant on %',target; end if;
  end loop;
  foreach target in array array['public.application_worklist'::regclass,'public.application_worklist_base'::regclass,'public.application_villages'::regclass] loop
    if not coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid=target),false) then
      raise exception 'View does not use caller RLS: %',target;
    end if;
  end loop;
  foreach proc in array array['public.workflow_action(uuid,text,integer,uuid,jsonb)'::regprocedure,
    'public.reserve_ai_request(uuid,text,integer)'::regprocedure,'public.workflow_officers(uuid)'::regprocedure,
    'public.application_assigned_officer(uuid)'::regprocedure,'public.can_read_application(uuid)'::regprocedure,
    'public.current_officer_role()'::regprocedure] loop
    if has_function_privilege('anon',proc,'EXECUTE') or not has_function_privilege('authenticated',proc,'EXECUTE') then
      raise exception 'Unexpected public RPC permissions: %',proc;
    end if;
    select prosecdef,proconfig into item from pg_proc where oid=proc;
    if not item.prosecdef or not coalesce(item.proconfig @> array['search_path=""'],false) then
      raise exception 'Unsafe RPC execution context: %',proc;
    end if;
  end loop;
  if has_schema_privilege('authenticated','private','USAGE') or has_schema_privilege('anon','private','USAGE') then
    raise exception 'Private schema is exposed';
  end if;
  if has_schema_privilege('authenticated','public','CREATE') or has_schema_privilege('anon','public','CREATE') then
    raise exception 'Untrusted API role can create objects in the public schema';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.application_events'::regclass and tgname='events_append_only' and tgenabled='O') then
    raise exception 'Append-only audit trigger missing';
  end if;
  raise notice 'PASS: RLS on all eight tables; no untrusted direct writes/anonymous reads; caller-rights views; RPC grants and fixed search paths; private schema isolation; immutable audit trigger.';
end;
$$;
rollback;
