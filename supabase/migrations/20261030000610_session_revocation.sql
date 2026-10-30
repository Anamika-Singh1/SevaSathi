-- Supabase JWT signatures remain valid until exp after sign-out. Sensitive
-- case access additionally requires the JWT's own Auth session to still exist.
-- This helper accepts no caller-supplied identity and exposes no session data.
create function private.has_live_session()
returns boolean language sql stable set search_path='' as $$
  select exists (
    select 1 from auth.sessions s
    where s.user_id=(select auth.uid())
      and s.id::text=((select auth.jwt())->>'session_id')
      and (s.not_after is null or s.not_after>now())
  );
$$;
revoke all on function private.has_live_session() from public,anon,authenticated;

create or replace function public.current_officer_role() returns public.officer_role
language sql stable security definer set search_path='' as $$
  select role from public.profiles
  where id=(select auth.uid()) and is_active and private.has_live_session();
$$;

create or replace function public.can_read_application(target_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.applications a
    join public.profiles p on p.id=(select auth.uid())
    where a.id=target_id and p.is_active and private.has_live_session()
      and p.district=a.district and p.taluk=a.taluk
      and (p.role in ('OPERATOR','CASEWORKER','APPROVING_OFFICER')
        or (p.role='FIELD_OFFICER' and a.assigned_field_officer_id=p.id))
  );
$$;

alter policy profiles_read_self on public.profiles
using (id=(select auth.uid()) and is_active and public.current_officer_role() is not null);

revoke all on function public.current_officer_role() from public,anon;
revoke all on function public.can_read_application(uuid) from public,anon;
grant execute on function public.current_officer_role() to authenticated,service_role;
grant execute on function public.can_read_application(uuid) to authenticated,service_role;

-- workflow_action and reserve_ai_request already authorize through
-- can_read_application under their transaction locks. Their stage, assignment,
-- version, confirmation and idempotency checks are unchanged.
notify pgrst,'reload schema';
