# Vercel deployment preparation

Status updated on 31 October 2026: source is prepared for Vercel; **no deployment or application URL has been verified**. The user reports successful execution of the original nine hosted setup parts and twelve fictional applications. Hosted UI login/dashboard success and operator intake remain unverified. The additional intake migration below is required after those nine parts. The earlier diagnosis found a mismatched local administrator key; use only matching hosted provisioning credentials. No Gemini key or authenticated Vercel project/CLI session was available during preparation. See [hosted login recovery](LOGIN_RECOVERY.md). GitHub/Vercel/Supabase connections were offered; connection is not assumed.

## Build configuration

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root directory | Repository root |
| Node.js | 22.x, at least 22.12; matches `.nvmrc` and `engines.node` |
| Install | `npm ci` |
| Build | `npm run build` |
| Output directory | Framework default; do not override |
| AI function | Node.js route; `maxDuration = 60`; provider timeout 30 seconds |

`vercel.json` declares the framework/install/build commands. This application needs server-rendered pages, Server Actions, proxy session refresh and an API route; do not convert it to static export. Vercel's [Next.js integration](https://vercel.com/docs/frameworks/full-stack/nextjs), [Node selection](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) and [function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration) document these settings. Confirm that the chosen account permits the declared function duration.

The engine is intentionally limited to the tested Node 22 major. `.gitignore` excludes `.vercel/`; `.vercelignore` excludes local environment files and generated logs/test artifacts from CLI uploads. Commit the package lock, source, migrations, documentation and public font license.

## Hosted Supabase prerequisites

Use a **dedicated fictional demo project**, separate from citizen or operational data. A local Docker URL such as `127.0.0.1:54321` is unreachable from Vercel functions.

1. Create/select the intended hosted Supabase project. Enable email/password login; disable public registration and anonymous sign-in; require passwords of at least 12 characters. Demo provisioning confirms the accounts through the administrator API, so it does not require sending mail to the fictional addresses.
2. Authenticate the Supabase CLI on the trusted provisioning workstation and link the actual project reference:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_ACTUAL_PROJECT_REF
   npx supabase migration list --linked
   npm run db:push -- --include-seed
   ```

   The project reference above is an explicit placeholder, not an existing hosted project. Review the selected reference before applying changes. For upgrades, apply pending committed migrations; never use a database reset on a live project. [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations).
3. Confirm all **nine migrations** are applied, including `20261030000600_security_review.sql`, `20261030000610_session_revocation.sql`, `20261031000100_application_intake.sql` and `20261031000200_complete_application_intake.sql`. The session helper depends on the JWT's session ID and Auth session table; see [Supabase session guidance](https://supabase.com/docs/guides/auth/sessions). Keep RLS and RPC grants intact.
4. On a fresh demo, apply both configured seed files exactly once through the CLI command above. Verify the original twelve fictional applications before adding rehearsal cases. Later-stage seed examples intentionally do not invent historical manual sign-offs.
5. Copy `.env.example` to ignored `.env.local` on the trusted workstation. Set the hosted URL, publishable key, server-only administrator key and four distinct demo passwords. Run `npm run demo:setup`. Provisioning resets those four passwords/seed assignments when rerun, so finish it before an evaluator session.
6. Verify one active trusted profile for each role, the fictional Mysuru jurisdiction, the twelve seed records, the three original field assignments and workflow ownership. Do not infer hosted readiness from the existing local database.

Supabase references: [password authentication](https://supabase.com/docs/guides/auth/passwords), [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

### Upgrading the nine-part hosted setup

The original `.qa/hosted-login-parts/01-core.sql` through `09-operator-and-seed.sql` install the original seven migrations and the restricted operator/fictional seed setup. They do **not** install the new application-entry RPC. After those parts succeed, apply the canonical `supabase/migrations/20261031000100_application_intake.sql` once, or run the prepared transactional wrapper `.qa/hosted-login-parts/10-application-intake.sql` once in the same project's SQL Editor. Do not rerun the fresh-only first part or reset the database.

SQL Editor execution does not update Supabase CLI migration history. Before a later `db:push`, inspect the actual schema and synchronize history with `supabase migration repair --status applied` only for verified applied versions: the original seven until intake succeeds, then `20261031000100` as well. Marking the intake version applied before running it would cause the CLI to skip the required RPC. Keep the generated `.qa` files local; the canonical migrations belong in the repository.

Then apply `supabase/migrations/20261031000200_complete_application_intake.sql` once (or its transactional SQL Editor wrapper `.qa/hosted-login-parts/11-complete-application-intake.sql`). Include version `20261031000200` in migration repair only after it succeeds. This adds the full form's application date, document receipts, notes and explicit screening/pending fields. A database with only the five-argument RPC cannot accept the full nine-argument request; apply both intake migrations in order. Use `supabase/diagnose-application-intake.sql` to inspect the actual schema, profile, RLS, grants and foreign keys without changing data.

Once installed, an operator can choose **Add application** from any workspace page. District/taluk come from the active profile. Application, notes, document receipts, workflow ownership, audit and retry receipt commit together. New cases appear in the dashboard screening queue. Newly entered records have `is_demo=false`; the twelve seed fixtures have `is_demo=true`. Use fictional details throughout. Read [intake verification](ADD_APPLICATION_VERIFICATION.md) for exact state-column mapping, tests and remaining hosted checks.

## Vercel environment variables

Set the intended Production and Preview environments deliberately. Preview deployments should use a separate disposable database or keep evaluation mutation isolated. Do not upload `.env.local` or copy administrator/test credentials wholesale into Vercel.

| Variable | Value source | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Hosted project's HTTPS API URL | Yes, before build |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Hosted publishable key or compatible anon key; never service role | Yes, before build |
| `GEMINI_API_KEY` | Real server-only Google key | For live assistance |
| `GEMINI_MODEL` | Accessible bare model ID, default `gemini-3.5-flash-lite` | Set explicitly for reproducibility |

Omit `SUPABASE_SECRET_KEY`, the four `DEMO_*_PASSWORD` values, `SEVASATHI_TEST_DEMO_PROJECT`, `TEST_BASE_URL` and browser-path overrides from the application runtime. They are trusted setup/test inputs. Keep Gemini settings server-only. The server runs case reads/writes using the caller's publishable-key session and RLS.

The public variables can be substituted at build time: changing them needs a new build/deployment. Rebuild/redeploy after configuration changes and verify the exact deployment environment. [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Gemini preflight

The server uses the official Google SDK with structured JSON output and independent validation. Google documents [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite); an existing model identifier does not prove that this account/key can use it.

After setting a real key and model, use fictional saved cases to generate assistance at all four stages. Verify English and Kannada, editable text, cooldown/retry behavior and that generation does not change workflow/history. Exercise failure/manual continuation as well. A successful provider response must pass validation and the final authorization/version recheck. Never log the key, raw provider error objects or prompts while diagnosing failures.

No successful live Gemini call was made during preparation because no key was configured. Automated successes use intercepted browser fixtures or in-memory SDK transport and must be described that way.

## Publish and configure the actual origin

Once authenticated access and hosted prerequisites exist:

1. Publish the intended reviewed commits to the configured GitHub repository and verify evaluator access. Import that actual repository into Vercel, or deploy the reviewed checkout through an authenticated CLI. No forced push or repository recreation is needed.
2. Confirm the build settings above and hosted environment variables, then deploy. Retain the deployment's returned URL and build/commit identity. Do not infer a URL from the project name.
3. Set Supabase Auth Site URL to the returned HTTPS application origin and allow only intended redirect origins. Password login currently uses Server Actions without an OAuth callback route; do not invent `/auth/callback`. [Supabase redirect documentation](https://supabase.com/docs/guides/auth/redirect-urls).
4. If Vercel deployment protection is enabled, arrange evaluator access and test from a fresh browser session. Platform protection and officer login are separate gates.
5. Complete the smoke test below against that exact URL. Only then record it in the README and email. Configure any custom domain after a working deployment and repeat origin checks.

## Hosted smoke test and release gate

These are **required future checks**, not results claimed by this preparation:

- [ ] Vercel build succeeds with Node 22 and the intended commit; no sensitive values appear in build/runtime logs or client artifacts.
- [ ] Anonymous access to dashboard, applications, all role queues and settings redirects to login; responses remain private/no-store.
- [ ] All four provisioned hosted officers can log in/out; cookies are HttpOnly/SameSite and Secure over HTTPS.
- [ ] Wrong-role queues, profile/metadata role changes, cross-jurisdiction case access and wrong-assignment actions are denied.
- [ ] All migrations, RLS policies, caller-rights views and constrained RPCs are present; signed-out token replay cannot approve/read a case.
- [ ] The twelve seed records and officer assignments are verified before adding evaluator cases.
- [ ] The intake migration is present; only the operator sees/uses **Add application**, invalid input is rejected, and a lost-response retry creates one case with its checklist and creation history.
- [ ] Run `npm run demo:case` from the trusted, opted-in hosted demo setup and complete its four stages through the real UI; verify approval or rejection and exact history.
- [ ] Complete a separate return/resume scenario; verify the correction destination and renewed sign-offs.
- [ ] Confirmed decision retries create one terminal event; closed cases cannot be edited.
- [ ] Live Gemini generation succeeds at each stage in the intended account/model; missing-key/provider failure still allows manual processing.
- [ ] Kannada/English toggle persists; dashboard/list/detail/decision controls work at 360/390px and desktop; check a physical phone if available.
- [ ] Share the actual URL and four passwords privately, rehearse the five-minute demo and record remaining limits truthfully.

Do not run the full mutation-capable test suite against operational data. Existing count-sensitive tests expect the original twelve-record fixture; run them before operator-entered or fresh evaluator cases, or use a separate QA project. The four SQL helper commands, including `npm run test:intake:database`, target local Docker and are not hosted test runners. New intake test results must be recorded after execution rather than inferred from the earlier Phase 6 results.

## Rollback and handoff

Preserve the last known working deployment and hosted database backup before changes. Use Vercel's previous deployment for application rollback, keeping environment/database compatibility in mind. Do not remove audit records or reverse applied migrations casually to make a demo look clean. Database corrections need reviewed forward migrations and an appropriate backup/restore plan.

Record the actual deployment URL, commit, hosted project, migration state, smoke-test date and live-AI result in a private operations handoff; publish only non-secret status in `PHASE_7_VERIFICATION.md`. The submission deadline is Monday, 2 November 2026; no cutoff time was supplied.
