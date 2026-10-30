-- Phase 1: officer identity, jurisdiction-scoped reads, and immutable client access.
-- Auth users are provisioned through the Admin API. User metadata never assigns roles.
create type public.officer_role as enum ('OPERATOR', 'FIELD_OFFICER', 'CASEWORKER', 'APPROVING_OFFICER');
create type public.application_status as enum (
  'SUBMITTED', 'FIELD_VERIFICATION', 'UNDER_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  role public.officer_role not null,
  district text not null check (char_length(trim(district)) between 1 and 100),
  taluk text not null check (char_length(trim(taluk)) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique check (reference_number ~ '^SS-[0-9]{4}-[0-9]{4,8}$'),
  applicant_name text not null check (char_length(trim(applicant_name)) between 1 and 120),
  village text not null check (char_length(trim(village)) between 1 and 120),
  district text not null,
  taluk text not null,
  annual_income numeric(12,2) not null check (annual_income >= 0),
  purpose text not null check (char_length(trim(purpose)) between 1 and 500),
  status public.application_status not null default 'SUBMITTED',
  created_by uuid references public.profiles(id) on delete set null,
  assigned_field_officer_id uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  document_type text not null check (char_length(document_type) between 1 and 100),
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text unique,
  uploaded_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index applications_jurisdiction_idx on public.applications(district, taluk, submitted_at desc);
create index applications_assigned_idx on public.applications(assigned_field_officer_id, status);
create index applications_creator_idx on public.applications(created_by);
create index documents_application_idx on public.application_documents(application_id);
create index documents_uploader_idx on public.application_documents(uploaded_by);
create index notes_application_idx on public.application_notes(application_id, created_at desc);
create index notes_author_idx on public.application_notes(author_id);
create index events_application_idx on public.application_events(application_id, created_at desc);
create index events_actor_idx on public.application_events(actor_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_updated before update on public.profiles
for each row execute function private.set_updated_at();
create trigger applications_updated before update on public.applications
for each row execute function private.set_updated_at();

-- SECURITY DEFINER avoids recursive profile RLS. Explicit schema names and an empty
-- search_path prevent caller-controlled object resolution. No caller-supplied user ID.
create function public.current_officer_role() returns public.officer_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and is_active;
$$;

create function public.can_read_application(target_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    join public.profiles p on p.id = (select auth.uid())
    where a.id = target_id and p.is_active
      and p.district = a.district and p.taluk = a.taluk
      and (
        p.role in ('OPERATOR', 'CASEWORKER', 'APPROVING_OFFICER')
        or (p.role = 'FIELD_OFFICER' and a.assigned_field_officer_id = p.id)
      )
  );
$$;

revoke all on function public.current_officer_role() from public, anon;
revoke all on function public.can_read_application(uuid) from public, anon;
grant execute on function public.current_officer_role() to authenticated, service_role;
grant execute on function public.can_read_application(uuid) to authenticated, service_role;

create function private.validate_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assigned_field_officer_id is not null and not exists (
    select 1 from public.profiles p where p.id = new.assigned_field_officer_id
    and p.role = 'FIELD_OFFICER' and p.is_active
    and p.district = new.district and p.taluk = new.taluk
  ) then
    raise exception 'Assigned field officer must be active and in the application jurisdiction';
  end if;
  return new;
end;
$$;
create trigger applications_validate_assignment
before insert or update on public.applications
for each row execute function private.validate_assignment();

create function private.audit_application() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events(application_id, actor_id, event_type, description, metadata)
    values (new.id, auth.uid(), 'APPLICATION_CREATED', 'ಅರ್ಜಿ ದಾಖಲಾಗಿದೆ / Application registered',
      jsonb_build_object('status', new.status, 'is_demo', new.is_demo));
  elsif new.status is distinct from old.status or new.assigned_field_officer_id is distinct from old.assigned_field_officer_id then
    insert into public.application_events(application_id, actor_id, event_type, description, metadata)
    values (new.id, auth.uid(), 'APPLICATION_UPDATED', 'ಅರ್ಜಿ ವಿವರ ನವೀಕರಣ / Application updated',
      jsonb_build_object('from_status', old.status, 'to_status', new.status,
        'assigned_field_officer_id', new.assigned_field_officer_id));
  end if;
  return new;
end;
$$;
create trigger applications_audit after insert or update on public.applications
for each row execute function private.audit_application();

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.application_notes enable row level security;
alter table public.application_events enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated
using (id = (select auth.uid()) and is_active);
create policy applications_read_scoped on public.applications for select to authenticated
using (public.can_read_application(id));
create policy documents_read_scoped on public.application_documents for select to authenticated
using (public.can_read_application(application_id));
create policy notes_read_scoped on public.application_notes for select to authenticated
using (public.can_read_application(application_id));
create policy events_read_scoped on public.application_events for select to authenticated
using (public.can_read_application(application_id));

-- Explicitly remove Supabase's default table grants, including TRUNCATE/REFERENCES.
-- Phase 1 is a read-only officer workspace. Writes and role administration are
-- restricted to the trusted setup script / database administrator. Workflow-specific
-- mutation RPCs and policies belong to a separately reviewed Phase 2.
revoke all on public.profiles, public.applications, public.application_documents,
  public.application_notes, public.application_events from public, anon, authenticated;
grant select on public.profiles, public.applications, public.application_documents,
  public.application_notes, public.application_events to authenticated;
grant all on public.profiles, public.applications, public.application_documents,
  public.application_notes, public.application_events to service_role;

comment on table public.profiles is 'Admin-managed officer roles. No signup trigger or user-metadata role assignment.';
comment on table public.application_documents is 'Metadata only in Phase 1. Demo rows contain no files or citizen identifiers.';
