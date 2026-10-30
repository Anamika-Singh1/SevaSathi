-- Administrator-only, one-user repair for the test operator explicitly verified
-- during diagnosis. Run in the intended hosted project's SQL Editor AFTER all
-- committed migrations. This is deliberately not an automatic migration.
-- No passwords, Auth metadata privileges, RLS policies or grants are changed.
begin;

do $$
declare
  authorized_id constant uuid := 'b4b19f10-ddd9-46d5-a618-d8277a7f94d3';
  authorized_email constant text := 'operator@sevasathi.example.com';
  affected_rows integer;
begin
  if to_regclass('public.profiles') is null
    or to_regprocedure('public.current_officer_role()') is null
    or to_regprocedure('public.workflow_action(uuid,text,integer,uuid,jsonb)') is null
    or to_regprocedure('private.has_live_session()') is null then
    raise exception 'Apply all committed SevaSathi migrations to this project before repairing the test officer.';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.profiles'::regclass) then
    raise exception 'Profile RLS must be enabled. Review the committed migrations; this repair does not change security policies.';
  end if;
  if not exists (
    select 1 from auth.users
    where id=authorized_id and lower(email)=authorized_email
      and email_confirmed_at is not null
  ) then
    raise exception 'The explicitly authorized, confirmed test user does not match this project. No officer profile was changed.';
  end if;
  -- Refuse to overwrite a different trusted role or jurisdiction. This statement
  -- authorizes only the named test OPERATOR in the fictional demo jurisdiction.
  if exists (
    select 1 from public.profiles
    where id=authorized_id and (
      role::text<>'OPERATOR' or district<>'ಮೈಸೂರು' or taluk<>'ಮೈಸೂರು'
    )
  ) then
    raise exception 'Existing officer role/jurisdiction differs. A trusted administrator must review it; no profile was changed.';
  end if;

  insert into public.profiles as existing (id,full_name,role,district,taluk,is_active)
  values (authorized_id,'ಮಾದರಿ ದತ್ತಾಂಶ ನಿರ್ವಾಹಕರು','OPERATOR','ಮೈಸೂರು','ಮೈಸೂರು',true)
  on conflict (id) do update set is_active=true
    where existing.role::text='OPERATOR'
      and existing.district='ಮೈಸೂರು' and existing.taluk='ಮೈಸೂರು';
  get diagnostics affected_rows = row_count;
  if affected_rows<>1 then
    raise exception 'Officer profile changed concurrently. No profile was activated; a trusted administrator must review it.';
  end if;
end;
$$;

select id,role,is_active,district,taluk
from public.profiles
where id='b4b19f10-ddd9-46d5-a618-d8277a7f94d3';

commit;
notify pgrst,'reload schema';
