-- Phase 2 adds read models only. Existing officer grants and RLS stay in force.
create table public.workflow_demo_settings (
  id boolean primary key default true check (id),
  target_days integer not null default 10 check (target_days between 1 and 365),
  stage_attention_days integer not null default 5 check (stage_attention_days between 1 and 180),
  due_soon_days integer not null default 2 check (due_soon_days between 0 and 30),
  urgent_action_count integer not null default 3 check (urgent_action_count between 1 and 100),
  recent_processed_days integer not null default 7 check (recent_processed_days between 1 and 90)
);
insert into public.workflow_demo_settings(id) values (true);
alter table public.workflow_demo_settings enable row level security;
create policy demo_settings_read on public.workflow_demo_settings for select to authenticated
using (public.current_officer_role() is not null);
revoke all on public.workflow_demo_settings from public, anon, authenticated;
grant select on public.workflow_demo_settings to authenticated;
grant all on public.workflow_demo_settings to service_role;
comment on table public.workflow_demo_settings is 'Administrator-configurable demonstration thresholds. These are NOT official government deadlines.';

alter table public.applications
  add column certificate_type text not null default 'ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ / Income certificate',
  add column target_date date,
  add column stage_entered_at timestamptz,
  add column processed_at timestamptz,
  add column field_report text,
  add column unresolved_actions text[] not null default '{}';

-- Recover known stage dates from audit history. Do not use unrelated updated_at
-- changes (such as officer assignment) as a new stage's starting time.
update public.applications a set
  stage_entered_at = coalesce((
    select max(e.created_at) from public.application_events e
    where e.application_id = a.id and e.metadata ->> 'to_status' = a.status::text
      and e.metadata ->> 'from_status' is distinct from e.metadata ->> 'to_status'
  ), a.submitted_at),
  processed_at = case when a.status in ('APPROVED', 'REJECTED') then coalesce((
    select max(e.created_at) from public.application_events e
    where e.application_id = a.id and e.metadata ->> 'to_status' = a.status::text
      and e.metadata ->> 'from_status' is distinct from e.metadata ->> 'to_status'
  ), a.updated_at) end;
alter table public.applications alter column stage_entered_at set default now();
alter table public.applications alter column stage_entered_at set not null;

create function private.track_stage_dates() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('APPROVED', 'REJECTED') then
      new.processed_at = coalesce(new.processed_at, now());
    end if;
  elsif new.status is distinct from old.status then
    new.stage_entered_at = now();
    new.processed_at = case when new.status in ('APPROVED', 'REJECTED') then now() else null end;
  end if;
  return new;
end;
$$;
create trigger applications_stage_dates before insert or update on public.applications
for each row execute function private.track_stage_dates();
create index applications_stage_entered_idx on public.applications(stage_entered_at);
create index applications_processed_idx on public.applications(processed_at);
create index applications_target_idx on public.applications(target_date);

-- A caller-rights view is essential: each underlying application still passes RLS.
create view public.application_worklist with (security_invoker = true) as
with timing as (
  select a.*, s.stage_attention_days, s.due_soon_days, s.urgent_action_count,
    coalesce(a.target_date, (a.submitted_at at time zone 'Asia/Kolkata')::date + s.target_days) as effective_target_date,
    a.status not in ('APPROVED', 'REJECTED') as is_pending,
    greatest(0, (coalesce(a.processed_at, now()) at time zone 'Asia/Kolkata')::date
      - (a.submitted_at at time zone 'Asia/Kolkata')::date) as days_pending,
    greatest(0, (coalesce(a.processed_at, now()) at time zone 'Asia/Kolkata')::date
      - (a.stage_entered_at at time zone 'Asia/Kolkata')::date) as stage_waiting_days,
    a.status in ('APPROVED', 'REJECTED') and a.processed_at >= now() - make_interval(days => s.recent_processed_days)
      and a.processed_at <= now() as recently_processed,
    cardinality(a.unresolved_actions) as unresolved_action_count,
    (now() at time zone 'Asia/Kolkata')::date as today
  from public.applications a cross join public.workflow_demo_settings s
), ranked as (
  select timing.*,
    is_pending and effective_target_date < today as is_overdue,
    case when is_pending then greatest(0, today - effective_target_date) else 0 end as days_overdue,
    case
      when not is_pending then 0
      when effective_target_date < today or stage_waiting_days >= stage_attention_days * 2
        or unresolved_action_count >= urgent_action_count then 3
      when stage_waiting_days >= stage_attention_days or unresolved_action_count > 0
        or effective_target_date <= today + due_soon_days then 2
      else 1 end as priority_rank
  from timing
)
select ranked.*,
  case priority_rank when 3 then 'URGENT' when 2 then 'HIGH' when 1 then 'NORMAL' else 'CLOSED' end as priority,
  case when not is_pending then array['ಪ್ರಕ್ರಿಯೆ ಪೂರ್ಣಗೊಂಡಿದೆ / Processing completed']
  else coalesce(nullif(array_remove(array[
    case when is_overdue then days_overdue || ' ದಿನ ಗುರಿ ಮೀರಿದೆ / day(s) past demo target' end,
    case when stage_waiting_days >= stage_attention_days then stage_waiting_days || ' ದಿನ ಈ ಹಂತದಲ್ಲಿ ಬಾಕಿ / day(s) waiting in this stage' end,
    case when unresolved_action_count > 0 then unresolved_action_count || ' ಬಾಕಿ ಕ್ರಮಗಳು / unresolved action(s)' end,
    case when not is_overdue and effective_target_date <= today + due_soon_days then 'ಗುರಿ ದಿನಾಂಕ ಸಮೀಪಿಸಿದೆ / Demo target approaching' end
  ], null), '{}'), array['ಸಾಮಾನ್ಯ ಸರತಿ / Within demo thresholds']) end as priority_reasons
from ranked;
revoke all on public.application_worklist from public, anon, authenticated;
grant select on public.application_worklist to authenticated, service_role;

create view public.application_villages with (security_invoker = true) as
select distinct village from public.applications;
revoke all on public.application_villages from public, anon, authenticated;
grant select on public.application_villages to authenticated, service_role;

-- Return only an assigned officer's display identity for an authorized application.
-- This avoids broadening profiles_read_self or exposing a directory of officers.
create function public.application_assigned_officer(target_id uuid)
returns table (id uuid, full_name text, role public.officer_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.role from public.applications a
  join public.profiles p on p.id = a.assigned_field_officer_id
  where a.id = target_id and public.can_read_application(a.id);
$$;
revoke all on function public.application_assigned_officer(uuid) from public, anon;
grant execute on function public.application_assigned_officer(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
