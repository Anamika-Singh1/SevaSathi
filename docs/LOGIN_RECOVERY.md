# Officer login diagnosis and safe recovery

## Verified cause

The current hosted Supabase project accepts the intended test operator's password. The next authenticated request for `public.profiles` returns HTTP 404 / `PGRST205`; the `current_officer_role()` RPC returns HTTP 404 / `PGRST202`. The application's expected table/function are unavailable in that project's exposed API schema/cache. This is a schema/migration problem, not evidence that RLS rejected an otherwise active row. [PostgREST error definitions](https://docs.postgrest.org/en/stable/references/errors.html).

`app/login/actions.ts` previously discarded the profile query error and checked only `if (!profile)`, so this database failure was incorrectly described as a missing active officer account. It now checks `profileError` separately within the denial branch, returns localized database-verification guidance and signs out the newly opened session. A successful query with no visible active profile retains the original administrator-activation message. Both cases deny access.

The verified existing test Auth identity is `operator@sevasathi.example.com`, ID `b4b19f10-ddd9-46d5-a618-d8277a7f94d3`. Its role/active status cannot be verified through the unavailable profile API until the schema is repaired. Authentication alone does not establish officer authorization.

Other configuration issues found: the administrator key belongs to the local demo while the public URL points to hosted Supabase; all four demo definitions had the same email and a password literal in `passwordEnv`. Definitions are restored to distinct accounts and environment-variable names, with a preflight guard. No mismatched administrator key was sent to the hosted project. No officer privileges are derived from user-editable metadata.

## Administrator recovery

Current full-intake instructions are in [ADD_APPLICATION_VERIFICATION.md](ADD_APPLICATION_VERIFICATION.md). After the original nine parts, apply intake parts 10 and 11 in order, each only if not already installed. Run Node 22 (`nvm use 22`); the installed Supabase client fails to initialize in a plain Node 20 process without WebSocket support. The current configured normal operator test password returned `invalid_credentials`; update it privately before retrying authenticated diagnostics. A password rejection does not establish the hosted profile role or migration state.

The user subsequently reported successful application of numbered files **01–09**, ending with `fictional_applications = 12`. A hosted dashboard login has not been independently verified. Those nine parts contain the original seven migrations. The later operator **Add application** feature requires one additional file: `.qa/hosted-login-parts/10-application-intake.sql`, a transaction-wrapped copy of `supabase/migrations/20261031000100_application_intake.sql`. Apply it once to the same project after 01–09; keep existing data. The button appears on the dashboard and application list for operators, and the form reports a setup message if the new RPC is unavailable. If using CLI migration repair later, include `20261031000100` only after its SQL has actually succeeded.

For the currently reported missing-schema error, a guarded one-time setup file is prepared at `.qa/hosted-login-setup.sql`. It combines the seven unchanged migrations, the exact test-operator repair and fictional seeds in one transaction. Open it locally and run its complete contents in the intended Supabase project's administrator SQL Editor. It refuses a wrong identity, banned/deleted/unconfirmed user, existing private/application schema or existing migration history. It is for a fresh dedicated demo schema; if a guard reports existing objects, stop and inspect the current database rather than deleting/resetting it.

If the SQL Editor freezes when pasting the full file, use the smaller numbered files in this workspace's `.qa/hosted-login-parts/` folder, **01 through 09 in order**. Paste and run one complete file per query. Each file commits independently; keep going only after success. All SQL function bodies remain intact. If a file fails, stop and resume at that failed step after diagnosis rather than restarting file 01. The final file verifies prerequisites before activating the operator and adding seed data. Complete all nine before testing login. These generated workspace files are ignored by Git; the canonical migrations remain in `supabase/migrations/`.

This SQL Editor path leaves internal CLI migration history untouched. After successful application and verification, synchronize the seven applied versions before later CLI upgrades:

```powershell
npx supabase migration repair --linked --status applied 20261029000100 20261030000100 20261030000200 20261030000300 20261030000400 20261030000600 20261030000610
```

That later command requires authenticated Supabase CLI access; it records already-applied migrations and does not execute their SQL. The one-user setup does not provision the three remaining officers. The steps below also cover an already initialized project.

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

3. For a fresh project, apply **all migrations** in `supabase/migrations/` in timestamp order, using the linked Supabase CLI migration workflow where possible. The original seven supply login/workflow; `20261031000100_application_intake.sql` additionally enables operator entry. The README lists them. Do not create a second ad-hoc profiles schema, disable RLS, grant anonymous reads or run a database reset against the hosted project. If migrations already exist, inspect migration history and the exposed `public` schema, then reload the API schema cache rather than blindly reapplying DDL:

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
