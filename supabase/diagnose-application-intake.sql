-- Read-only administrator checks for the intended Supabase SQL Editor.
-- Does not repair users, change passwords, grant writes or apply migrations.
-- For a compact exact-signature/grant check, run inspect-application-intake.sql.
-- A regprocedure match below checks argument TYPES, not parameter NAMES or API cache visibility.
select to_regclass('public.applications') as applications_table,
  to_regprocedure('public.current_officer_role()') as officer_role_rpc,
  to_regprocedure('public.create_application(uuid,text,text,numeric,text)') as base_intake_rpc,
  to_regprocedure('public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)') as full_intake_rpc;

select table_name,column_name,data_type,is_generated
from information_schema.columns
where table_schema='public' and table_name in (
  'applications','application_workflow','application_checklist','application_notes','application_events')
order by table_name,ordinal_position;

select p.id,p.role,p.is_active,p.district,p.taluk,u.email_confirmed_at
from public.profiles p join auth.users u on u.id=p.id
where lower(u.email)='operator@sevasathi.example.com';

select c.relname,c.relrowsecurity,
  has_table_privilege('authenticated',c.oid,'SELECT') as officer_read,
  has_table_privilege('authenticated',c.oid,'INSERT') as direct_insert,
  has_table_privilege('anon',c.oid,'SELECT') as anonymous_read
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'profiles','applications','application_workflow','application_checklist','application_notes','application_events');

select has_function_privilege('authenticated',to_regprocedure(
  'public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)')::oid,'EXECUTE') as officer_intake_execution;

select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public'
  and tablename in ('profiles','applications','application_notes','application_events');

select conrelid::regclass as source_table,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace='public'::regnamespace
  and contype='f' order by conrelid::regclass::text,conname;
