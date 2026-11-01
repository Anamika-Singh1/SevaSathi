# Phase 7 preparation and login-recovery verification

Review date: 30 October 2026 (Asia/Kolkata). Deadline supplied: Monday, 2 November 2026; no cutoff time was supplied.

## Prepared artifacts

- Rewritten professional README covering service, officers, workflow, AI/human control, Kannada, architecture/data/security, impact, setup, tests, deployment and limitations.
- Pilot metric definitions and collection plan; five-minute evaluator script; final requirement matrix; submission email draft, not sent.
- Vercel framework/install/build configuration, tested Node 22 engine and `.nvmrc`, explicit AI-route 60-second duration, environment/upload ignore rules.
- TypeScript command generates Next route declarations first; generated `next-env.d.ts` is ignored.
- Guarded `demo:case` command for a fresh fictional rehearsal case. A successful insert has not been executed against the newly configured hosted project; the administrator credential mismatch must be resolved first.
- Login query errors now differ from absent active profiles in Kannada/English; both fail closed and clear the new session.
- Restored four distinct demo emails and environment-variable names, with runtime preflight before any provisioning/password lookup.
- Restricted one-user operator SQL and a hosted recovery guide; neither disables RLS nor authorizes every registrant.

## Executed current checks

| Check | Result |
| --- | --- |
| ESLint | Passed, zero warnings |
| `next typegen` + TypeScript | Passed |
| Vitest | Passed: 32 tests across 8 files, including seven login-action and five demo-definition regressions |
| Production build | Passed, Next.js 16.4.3 on Node 22.23.3 |
| Generated-artifact secret scan | Passed: none of five configured secret values detected; Gemini SDK/test transport absent from client artifacts |
| Ignore rules | Confirmed `.env.local`, `.next`, test output, TypeScript build metadata, generated Next declarations and `.vercel` state are ignored |
| Demo case refusal guard | Passed: opt-in `false` rejects before any Supabase access; a successful insertion was not executed |
| Documentation links | Local Markdown link check passed |
| Git remote | Read-only access succeeded; no remote branch references were returned at that check |
| Hosted test Auth | Intended existing operator authenticated successfully; diagnostic session signed out afterward |
| Hosted own-profile read | Failed: HTTP 404 / `PGRST205` |
| Hosted officer-role RPC | Failed: HTTP 404 / `PGRST202` |
| Repeated public API/configuration check | Supplied URL/key exactly match `.env.local`; profile and role API still return the same schema-cache 404 errors |
| Fresh SQL setup bundle, isolated local PostgreSQL 17 | Passed: twelve seeds, only the authorized active operator, eight RLS tables, existing security suite, authenticated own-profile/application reads, safe rerun refusal and test-database cleanup |
| Nine smaller SQL Editor files, isolated local PostgreSQL 17 | Passed in order: RLS and no anonymous reads/direct untrusted writes after every committed part; no profile activated before final part; final operator/scoped reads, twelve seeds, security suite, first-part rerun refusal and isolated database cleanup verified |
| Hosted administrator/CLI access | No usable authenticated Supabase CLI project access confirmed; no matched hosted administrator connection available |

An earlier check caught a TypeScript narrowing issue in the new demo preflight; it was corrected before the passing run above. The earlier Phase 6 production build/reporter and browser assertion corrections remain documented in `QA_REPORT.md`.

The Phase 6 local results remain historical evidence: 25 live integration tests, seven unique browser scenarios across full/targeted runs, three SQL suites and a production audit with zero reported vulnerabilities. Those mutation-capable suites were **not rerun against the newly configured hosted project**, whose schema is unavailable. Do not reinterpret local results as hosted verification.

## Login root cause and remaining action

The app discarded a profile-query error and treated `profile === null` as an inactive officer. The normal hosted user's actual requests instead show unavailable exposed schema/table/function definitions. Committed profile RLS permits only the active caller backed by a live Auth session, and no signup trigger grants roles. Actual hosted profiles/policies/triggers cannot be inspected through the missing API or without an authorized administrator connection.

Apply the existing migrations to the intended hosted project, inspect the verified test identity, then run `supabase/repair-authorized-test-officer.sql` only if its authorized profile is missing/inactive. The script refuses a different, unconfirmed, banned/deleted user or conflicting role/jurisdiction, including a concurrent update, and checks essential schema objects; migration completeness must be verified separately. A single guarded fresh-schema SQL Editor bundle was prepared at `.qa/hosted-login-setup.sql` and passed isolated local PostgreSQL verification with synthetic Auth state. No SQL has been executed on the hosted database. Recheck a fresh login and `/dashboard` afterward. See `LOGIN_RECOVERY.md` for exact diagnosis, SQL and restart steps.

Automatic approval review rejected a diagnostic containing a mismatched local administrator-key request to hosted Supabase. That command was not executed. A safer normal-account-only diagnostic was approved and produced the hosted results above. No mismatched administrator key was transmitted, no hosted profile was changed, and no RLS bypass was applied.

## External submission state

- Actual configured remote: https://github.com/Anamika-Singh1/SevaSathi. Source publication/evaluator access is unverified.
- Local source preparation commit: `59371c8` (`feat: add tested SevaSathi workflow and safe officer login`); documentation was committed separately. Both staged snapshots were checked against configured secrets and excluded environment/generated files. No GitHub push was performed. The user's locally installed `.agents` skill files and `skills-lock.json` were left outside these commits.
- No verified deployed URL or Vercel deployment. Public hosted project configuration alone does not establish database or application readiness.
- Successful live Gemini generation, physical-device testing, hosted smoke tests and pilot impact remain unverified.
- Existing administrator/demo values must be aligned to the selected project privately before running provisioning. API keys/passwords are never submission artifacts.
- Original full Kenpath brief was unavailable; the final matrix covers all requirements supplied in this conversation without inventing an external score/rubric.

Any subsequent publication or hosted recovery must be recorded from actual results, not inferred from local preparation.
