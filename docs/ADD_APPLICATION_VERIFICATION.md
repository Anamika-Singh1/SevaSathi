**Add Application diagnosis and verification — 31 October 2026 (Asia/Kolkata)**

## Hosted installation and API resolution confirmed on 1 November 2026

The user reported the updated repair's successful result, `READY: Add application database functions installed`, with a non-null `create_application(uuid,text,text,numeric,text,date,text,jsonb,text)` function. A subsequent agent check against the configured hosted project used only the publishable key and null arguments: the API now resolves the full function and returns the expected anonymous-execution denial, HTTP 401 / SQLSTATE `42501`, instead of `PGRST202`. This check created no application and used no administrator credential.

The missing-function/API-resolution blocker is resolved in the hosted project. An authenticated creation from the user's existing form remains to be confirmed. Retry the existing populated form so entries are retained; a development-server restart is not required for this database change.

## Fingerprint-check correction on 1 November 2026

The user subsequently ran the whole repair and received `Existing intake RPC differs from the reviewed migration`. This failure was reproduced locally on a fresh database by changing only spaces in a function declaration: the repair created the function, then rejected it against its hard-coded MD5 and rolled back. The error did not establish that a pre-existing function had been customized.

The repair now holds each complete installation definition in `base_install_sql` or `full_install_sql` and compares the stored body with the body from that same definition, normalizing line endings and outer whitespace. It no longer relies on separate hard-coded fingerprints that can become stale when a copied script is formatted. Existing bodies must still match the supplied definition; parameter names, return type, function kind, security-definer configuration and fixed search path are also checked. A real mismatch aborts with the exact signature and safe boolean diagnostics, without altering that function or saved records.

The isolated test suite now covers three scenarios: original setup, base intake, and formatted SQL with CRLF line endings. It verifies installation, one application/audit event, retry deduplication, truthful readiness checks, grant repair, preserved row/receipt/sequence snapshots, and refusal of genuinely changed function bodies and inconsistent partial schemas. The original existing local and hosted application databases are not mutation targets. The user subsequently reran the complete corrected repair successfully; see the hosted confirmation above.

## Recurrence checked on 1 November 2026

The running development server recorded `PGRST202` from the nine-argument `create_application` call again. The Supabase URL and publishable key supplied by the user exactly match `.env.local` and target `qwbwoyzsnktumbcqxztl`. The server action's nine parameter names match the complete intake migration.

The same authenticated nine-argument API probe succeeds at function resolution on local Supabase, returning the expected `22023 / INTAKE_INVALID_INPUT` for null inputs before any insertion. This validates the current API contract locally; it does not establish the hosted function's existence, grants or cache state.

A new compact, read-only [intake contract inspection](../supabase/inspect-application-intake.sql) checks both signatures, exact parameter names, schema usage, execution grants and function configuration. It was executed successfully against local PostgreSQL and reports `READY_IN_DATABASE` for both functions. This label deliberately does not claim PostgREST cache readiness. The earlier diagnosis only checked argument types through `regprocedure`, which cannot detect a parameter-name mismatch.

The user supplied hosted inspection rows with `installed_arguments=NULL`, `officer_schema_usage=true`, `officer_execute=false` and `anonymous_execute=false` for both expected signatures. The required named, executable intake functions are unavailable in that database. The displayed signature column is the expected contract supplied by the diagnostic, not proof that a function exists. The pasted excerpt omitted the diagnosis column, so an existing unnamed custom function cannot be ruled out solely from that excerpt; the guarded repair refuses unreviewed implementations.

Inspection also found a misleading status check: the old repair file's final SELECT always printed the literal `READY` label, even if its function lookup returned NULL. Running only that selected SELECT could therefore appear successful without installing anything. The final query now checks both functions, their exact parameter names, schema usage and execution permissions, and returns `NOT_READY` when those requirements fail. Run the entire updated [repair file](../supabase/repair-application-intake.sql) in project `qwbwoyzsnktumbcqxztl`, then rerun the read-only inspection. The script installs missing intake updates, grants only the reviewed RPC execution rights and reloads the API schema; it preserves existing application records and RLS.

The updated isolated repair tests cover both a database with neither intake function and a base-intake database. They verify missing-function versus missing-grant diagnoses, refusal to print READY when only the final SELECT is run before installation, installation of both reviewed functions, correct named arguments/grants, successful officer creation, one audit event, idempotent retry, preservation of all existing rows/receipts/sequence state and safe refusal of inconsistent partial schemas. No hosted SQL or data change was executed by the agent; hosted installation and a successful UI retry remain pending. The normal diagnostic operator credential still returns `invalid_credentials`, and no hosted administrator connection is available here.

The user has now confirmed the exact hosted UI message: **Application creation is not configured**. In `applications/new/actions.ts` this message is returned specifically for PostgREST `PGRST202`: the database API cannot resolve the nine-argument creation RPC. This confirms a hosted function/signature/API-exposure blocker independently of the separate diagnostic password issue.

For this error, a single administrator file is now available: [repair-application-intake.sql](../supabase/repair-application-intake.sql). Run the whole file in project `qwbwoyzsnktumbcqxztl` using Supabase SQL Editor. It installs missing intake migrations, restores the reviewed RPC execution grants and requests an API schema reload, preserving existing applications, notes, workflow, audit, retry receipts and reference-sequence values. Existing canonical functions are left in place; custom or partial inconsistent schemas are refused atomically. It returns `READY: Add application database functions installed`. It can be rerun safely after success. This administrator repair does not alter passwords or profiles and does not reset databases or disable RLS. The application error now names this exact repair in Kannada and English.

The user subsequently reported that the hosted SQL Editor returned **READY: Add application database functions installed**. Hosted repair execution is user-confirmed; the agent has no Supabase administrator session. A retry from the existing signed-in application form is pending to confirm hosted saving and details-page navigation. Do not reapply the original setup parts or change the operator password to install this database repair.

`npm run test:intake:repair` passed on newly created isolated PostgreSQL 17 databases representing the original setup and the base-only intake setup. Both gained working operator creation and one creation audit. Full row-value snapshots, receipts and sequence state stayed unchanged through upgrades and repeated/grant-repair runs. A partially interrupted schema was refused without data changes. The temporary databases were removed; the existing local and hosted application databases were not mutation targets. The test never reads `.env.local` or connects to hosted Supabase. New files are `supabase/repair-application-intake.sql` and `scripts/test-intake-repair.mjs`; the npm command, localized error and this guide were also updated.

ESLint and the eleven relevant localization/server-action unit tests passed for the follow-up repair changes.

The existing project was repaired in place. Creation uses a normal authenticated operator's Supabase session and a PostgreSQL transaction function. No service-role key was added to application/browser code, no direct officer table writes were granted, and RLS remains enabled.

The investigation established these concrete problems:

- The original SQL Editor setup parts 01–09 contain the original seven migrations and seeds, but do not install `create_application`. Part 10 installs the original five-argument RPC; the complete form requires the additional nine-argument RPC installed by part 11. A missing matching signature produces PostgREST `PGRST202`, which the action reports as a database-setup problem. The exact hosted RPC state still requires an authenticated check or the administrator SQL below.
- The old intake form submitted only name, village, income and purpose. It had no application-date, certificate-service, receipt-checklist or optional-note payload.
- The old dashboard attention query required `priority_rank >= 2`. A newly entered normal-priority case therefore did not appear in that dashboard list, even after successful insertion. A dedicated document-screening queue now includes the five newest submitted cases.
- The default terminal runtime was Node 20.19.3. Creating the installed Supabase client in that runtime threw `Node.js 20 detected without native WebSocket support`. Node 22.23.3 successfully runs the real Supabase integration. Startup/build commands now enforce the repository's existing Node 22 requirement.
- The development log recorded `NotFoundError: Failed to execute insertBefore` at the login spinner insertion. It also recorded browser-extension attributes on the page. External DOM mutation is a plausible contributor, not independently proven. Login and application submit buttons now retain stable icon/label elements during pending transitions.
- The configured hosted diagnostic password returned Auth `invalid_credentials`, including the last read-only retry after `.env.local` changed. This prevents independent hosted profile/RPC and insertion verification. Browser login uses the password entered in its form; automated diagnosis uses `DEMO_OPERATOR_PASSWORD`. No hosted password or officer role was reset.

The completed form includes applicant name, village, read-only district/taluk from the active officer profile, income certificate service, application date, annual income, purpose, three required-document receipt declarations and optional notes. The application date must be valid, no earlier than 1900 and no later than today in Asia/Kolkata. Missing documents remain on the screening checklist; these controls record officer receipt declarations rather than upload files. Kannada/English labels and errors are supported.

The server validates the complete payload using Zod, authorizes only active operators, and calls the nine-argument `public.create_application`. PostgreSQL independently checks the active profile, live Auth session, role, field limits, date, service and exact document keys. District/taluk, creator, reference number and initial state come from trusted server/database values. Foreign keys reference the existing profiles/application tables.

The existing transition engine uses `applications.status` as a combined workflow-stage enum. Replacing `SUBMITTED` with an unsupported `PENDING` enum would break screening and later handoffs. The migration preserves that engine and exposes explicit generated fields:

| Column | Initial value |
| --- | --- |
| `applications.status` | `SUBMITTED` (existing transition value) |
| `applications.workflow_stage` | `DOCUMENT_SCREENING` |
| `applications.processing_status` | `PENDING` |
| `applications.application_date` | Selected date, derived from `submitted_at` in Asia/Kolkata |
| `application_workflow.operator_id` | Authenticated active operator |

Application, initialized workflow, document receipts, optional `application_notes` row, `APPLICATION_CREATED` event and retry receipt commit in one transaction. An advisory transaction lock serializes the same request UUID across server instances. The canonical payload includes the date, service, sorted document receipts and trimmed notes. Identical retries return the same application; changed committed payloads or another actor reusing that UUID are rejected. Server-generated references use a private sequence and the existing unique constraint. No success is returned until the database returns a validated receipt.

`revalidatePath` refreshes dashboard/application-list data. The client disables controls during submission, retains entries after failure, and navigates to the saved application's details after success. Unauthorized roles cannot open the form or invoke creation successfully. Direct `INSERT` on application/audit tables remains intentionally denied; the checked RPC is the authorized write boundary.

Executed verification against the real local Supabase/PostgreSQL 17.11 project:

| Requested check | Evidence |
| --- | --- |
| Button opens form | Browser checks from dashboard, Applications and workspace header; mobile/tablet/desktop |
| Required validation | Real empty-form submission focuses the first invalid field; Zod date/service/document/note boundary tests |
| Authorized creation | Real operator password Auth followed by PostgREST RPC and browser Server Action |
| Unauthorized denial | Anonymous and field-officer browser entry denied; all downstream roles, inactive officers and revoked sessions denied by SQL tests |
| Supabase persistence | Real application, workflow, checklist, note and event rows read back |
| Unique number | Independent real RPC requests produce distinct server references; SQL reference-collision retry passes |
| Audit creation | Exactly one `APPLICATION_CREATED` event, correct actor and screening/pending snapshot |
| Dashboard/list visibility | Browser finds the saved reference in the screening queue and application search |
| Details page | Browser opens saved details and successfully saves normal screening progress |
| Duplicate prevention | Five concurrent real Auth/PostgREST requests commit one case/event; lost-response browser retry returns that same case |
| Atomic failure | Injected audit, note and receipt failures leave no partial application/children/history/receipt |
| Existing security/workflow | Existing RLS/security and workflow atomicity SQL suites pass; eight public tables retain RLS, caller-rights views and no untrusted direct writes |

TypeScript, ESLint, 48 Vitest tests and production builds passed. The local intake suite uses actual Auth/PostgREST/PostgreSQL; successful creation responses are not browser fixtures. Both final browser scenarios passed after the stable-button change, including explicit assertions for no unhandled browser errors. The browser/test/log artifact scan found none of the five configured private secret values. The final normal-environment production build also passed. Test cases and receipts are cleaned up, leaving the original twelve fictional applications and zero intake receipts. Sequence gaps from rolled-back tests are expected.

Run the checks with Node 22:

```powershell
nvm use 22
npm run typecheck
npm run lint
npm test
npm run test:intake:local
```

The local runner reads keys directly from `supabase status` in memory and forces localhost targets. It provisions only the four existing marked demo accounts using the repository's guarded setup, which refuses unrelated accounts. Dedicated generated local passwords are stored in ignored `.env.intake.local`; hosted `.env.local` is preserved. The runner runs rollback SQL checks, real concurrent RPC tests, a production build and Playwright. Its browser uses installed Chrome on Windows when the matching Playwright download is unavailable. A normal `npm run build` restores build artifacts for the regular `.env.local` configuration afterward.

For your hosted project, the remaining manual work is explicit:

1. Run [the read-only administrator diagnosis](../supabase/diagnose-application-intake.sql) in the intended Supabase SQL Editor. Inspect both RPC signatures, columns, the actual operator profile, RLS/grants and foreign keys. The active profile must belong to the real signed-in Auth user and have role `OPERATOR` in the intended jurisdiction.
2. If the base RPC is absent, apply [20261031000100_application_intake.sql](../supabase/migrations/20261031000100_application_intake.sql) once. Its local SQL Editor wrapper is `.qa/hosted-login-parts/10-application-intake.sql`.
3. If the full RPC/generated columns are absent, apply [20261031000200_complete_application_intake.sql](../supabase/migrations/20261031000200_complete_application_intake.sql) once, after the base migration. Its transaction-wrapped local copy is `.qa/hosted-login-parts/11-complete-application-intake.sql`. Preserve existing data; do not restart parts 01–09. Only repair CLI migration-history versions after their SQL has actually succeeded.
4. Use Node 22 for local commands. The development server was restarted at `http://localhost:3000` under Node 22, using the existing `.env.local` project configuration.
5. Update `DEMO_OPERATOR_PASSWORD` privately to a working password for `operator@sevasathi.example.com`, then run `npm run diagnose:intake`. It reads using the normal user and probes both RPCs with null inputs that cannot create records. A configured password rejection must be resolved before claiming hosted verification. Do not paste passwords or keys into chat.
6. Refresh localhost, sign in as the operator and create one fictional case. Hosted saving and dashboard visibility remain pending until the hosted migrations and working credentials are verified. No SQL migration or application insert was executed against the hosted database during this repair.

Files changed during this repair (the pre-existing workspace/header and other unrelated edits were preserved):

- `app/(workspace)/applications/new/actions.ts`
- `app/(workspace)/applications/new/page.tsx`
- `app/(workspace)/applications/[id]/page.tsx`
- `app/(workspace)/dashboard/page.tsx`
- `components/application-create-form.tsx`
- `components/login-form.tsx`
- `lib/application-intake.ts`
- `lib/roles.ts`
- `lib/i18n/en.json`
- `lib/i18n/kn.json`
- `services/applications.ts`
- `types/database.ts` (regenerated from the actual migrated local schema)
- `supabase/migrations/20261031000200_complete_application_intake.sql`
- `supabase/diagnose-application-intake.sql`
- `scripts/check-runtime.mjs`
- `scripts/diagnose-application-intake.ts`
- `scripts/test-application-intake-local.mjs`
- `tests/application-intake.test.ts`
- `tests/create-application-actions.test.ts`
- `tests/auth.test.ts`
- `tests/database/application-intake.sql`
- `tests/integration/application-intake.test.ts`
- `tests/browser/application-intake.spec.ts`
- `package.json`
- `README.md`
- `docs/DEPLOYMENT.md`
- `docs/LOGIN_RECOVERY.md`
- `docs/ADD_APPLICATION_VERIFICATION.md`
- `.qa/hosted-login-parts/11-complete-application-intake.sql` (ignored local SQL Editor copy)
- `.qa/hosted-login-parts/README.md` (ignored local instructions)

`.env.intake.local` is an ignored generated local-test credential artifact. Its values are not source changes, public assets or hosted configuration.
