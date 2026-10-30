# Officer login diagnosis and safe recovery

## Verified cause

The current hosted Supabase project accepts the intended test operator's password. The next authenticated request for `public.profiles` returns HTTP 404 / `PGRST205`; the `current_officer_role()` RPC returns HTTP 404 / `PGRST202`. The application's expected table/function are unavailable in that project's exposed API schema/cache. This is a schema/migration problem, not evidence that RLS rejected an otherwise active row. [PostgREST error definitions](https://docs.postgrest.org/en/stable/references/errors.html).

`app/login/actions.ts` previously discarded the profile query error and checked only `if (!profile)`, so this database failure was incorrectly described as a missing active officer account. It now checks `profileError` separately within the denial branch, returns localized database-verification guidance and signs out the newly opened session. A successful query with no visible active profile retains the original administrator-activation message. Both cases deny access.

The verified existing test Auth identity is `operator@sevasathi.example.com`, ID `b4b19f10-ddd9-46d5-a618-d8277a7f94d3`. Its role/active status cannot be verified through the unavailable profile API until the schema is repaired. Authentication alone does not establish officer authorization.

Other configuration issues found: the administrator key belongs to the local demo while the public URL points to hosted Supabase; all four demo definitions had the same email and a password literal in `passwordEnv`. Definitions are restored to distinct accounts and environment-variable names, with a preflight guard. No mismatched administrator key was sent to the hosted project. No officer privileges are derived from user-editable metadata.

## Administrator recovery

1. Open the intended hosted Supabase project `qwbwoyzsnktumbcqxztl`. Do not use the local demo administrator key against it. If provisioning from a workstation, configure matching hosted credentials in ignored `.env.local`; do not paste keys into chat or source.
2. In the SQL Editor, inspect schema availability and the named identity:

   ```sql
   select to_regclass('public.profiles') as profiles_table,
          to_regprocedure('public.current_officer_role()') as officer_role_rpc,
          to_regprocedure('private.has_live_session()') as live_session_helper;
   select id,email,email_confirmed_at
   from auth.users
   where id='b4b19f10-ddd9-46d5-a618-d8277a7f94d3'
     and lower(email)='operator@sevasathi.example.com';
   ```

3. Apply **all seven existing files** in `supabase/migrations/` in timestamp order, using the linked Supabase CLI migration workflow where possible. The README lists them. Do not create a second ad-hoc profiles schema, disable RLS, grant anonymous reads or run a database reset against the hosted project. If migrations already exist, inspect migration history and the exposed `public` schema, then reload the API schema cache rather than blindly reapplying DDL:

   ```sql
   notify pgrst,'reload schema';
   ```

4. After migrations, inspect the one existing profile:

   ```sql
   select id,role,is_active,district,taluk
   from public.profiles
   where id='b4b19f10-ddd9-46d5-a618-d8277a7f94d3';
   ```

5. If the authorized test operator is missing or inactive, run [repair-authorized-test-officer.sql](../supabase/repair-authorized-test-officer.sql) in that project's administrator SQL Editor. It binds the **exact existing ID and confirmed email**, grants only `OPERATOR` in fictional Mysuru, preserves an existing matching role/jurisdiction, activates that one row and refuses conflicting profiles, including a concurrent conflicting update. It checks essential schema objects; independently verify that all seven migrations were applied. It never creates Auth users or automatically authorizes registrants. Inspect the SQL before execution.
6. For the dashboard's fictional records, apply `supabase/seed.sql` and `supabase/phase-two-demo.sql` to the dedicated demo project if not already seeded. Full four-role provisioning requires four distinct managed demo users; `demo:setup` refuses to take over existing unmarked accounts and needs matching hosted administrator credentials. The one-user repair does not mark an account for takeover by that setup script.
7. Restart `npm run dev`, or rebuild/restart production with `npm run build` and `npm run start`, after changing public project environment variables. Sign in again to create a fresh session. Verify that the normal user can read its own active profile, sees role `OPERATOR`, reaches `/dashboard`, and remains unable to open `/decisions` or write profiles directly. Repeat Kannada/English rendering.

## RLS and triggers

The committed `public.profiles` table has an Auth-user primary/foreign key, full name, one of four enum roles, district/taluk, active flag and timestamps. The self-read policy requires the caller's own ID, active status and a valid role backed by a live Auth session. Officer clients cannot insert/update profiles.

The repository deliberately has **no Auth signup trigger creating officer profiles**. The profile trigger only maintains `updated_at`; application triggers initialize workflow/checklists and audit case changes. Auth registration must not automatically grant officer privileges. An administrator can inspect actual hosted triggers/policies after migration:

```sql
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid='auth.users'::regclass and not tgisinternal;
select policyname,roles,cmd,qual
from pg_policies
where schemaname='public' and tablename='profiles';
```

The live hosted policy/trigger definitions were not accessible with an authorized administrator connection during diagnosis. The normal user's actual requests established the schema errors above; the committed definitions were reviewed. No RLS bypass or broad role grant was applied.

## Verification status

Hosted password authentication was executed successfully. Hosted own-profile/role reads failed with the recorded schema errors. A hosted `/dashboard` success must be rechecked after the administrator applies migrations and the restricted profile repair; it is not claimed yet. Unit/build results are recorded in the Phase 7 verification record after execution.
