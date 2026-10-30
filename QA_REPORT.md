# Phase 6 QA and security review

Review date: 30 October 2026 (Asia/Kolkata).

## Environment and scope

Reviewed authentication, server actions, API handlers, workflow rules, Supabase migrations and grants, data services, localization, mobile components, tests, configuration, and secret handling. Live checks use the opted-in disposable local Supabase project with fictional officers and applications. HTTP and browser checks run against `next start`, using the production build.

Runtime: Node 22.23.3; Next.js 16.4.3; PostgreSQL 17; Vitest 5.0.5; Playwright 1.64.1. Browser execution uses the existing Chromium revision 1243 through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` because Playwright's default revision 1248 is absent. The default system Node 20 failed before checks executed; supported Node 22 was used for the results below.

## Corrections

1. **Production build blocker:** `SecretRedactionReporter.onEnd` returned a status synchronously, which does not satisfy Playwright's reporter contract. Making it asynchronous preserves failure propagation and fixes TypeScript/build execution (`tests/redact-reporter.ts`).
2. **False browser failures:** the protected-route test parsed a relative `Location` header without a base URL, then matched Next.js's accessibility route announcer alongside the application alert. It now resolves redirects against the application origin and scopes the denial alert to the main content (`tests/browser/phase-six.spec.ts`).
3. **Audit verification:** strengthened the approval integration test to assert the exact four-stage transition chain, seven ordered save/submission/decision events, distinct request identities, consecutive before/after versions, and increasing event sequences (`tests/integration/workflow.test.ts`).

## Executed engineering checks

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 20 tests across 6 files |
| `npm run build` | Passed after reporter correction |
| `npm run test:integration` | Passed: 25 live tests, zero skipped; includes strengthened audit assertions |
| `npm run test:security:database` | Passed; read-only transaction |
| `npm run test:workflow:database` | Passed; injected failure and all fixtures rolled back |
| `npm run test:ai:database` | Passed; quota checks rolled back |
| Playwright | All 7 unique scenarios verified: 6 passed in the full regression, then both Phase 6 scenarios passed in the targeted rerun after assertion fixes; zero skipped |
| `npm run test:secrets` | Passed: no configured secret values found in client/test/log artifacts; Gemini SDK/test transport absent from client bundle |
| `npm audit --omit=dev --json` | Passed: zero reported production dependency vulnerabilities |

The full Playwright run initially reported 6 passed / 1 failed because of the route-test assertion defects described above. The final targeted command was `npm run test:e2e -- tests/browser/phase-six.spec.ts`, which passed both scenarios. This is verification across those runs, not a claim that the earlier full run was green.

## Functional coverage

| Requested area | Evidence |
| --- | --- |
| Login/logout | Real four-officer Supabase logins; HTML Server Action login/logout; HttpOnly/SameSite cookies; mobile sign-out and draft cleanup |
| Protected routes | Anonymous HTTP redirects; authenticated route permission checks; direct RLS reads and RPC denials |
| Four role permissions | Role-specific queues; role/assignment/stage checks; user metadata and browser role tampering; jurisdiction and deactivation checks |
| Dashboard metrics | All six rendered metrics compared with live database results; priority/overdue/recent boundaries |
| Search/filtering | Combined filters, clearing, Kannada names, partial references, UUIDs, wildcard/grammar injection, sorting, pagination and empty results |
| Document screening | Required receipts, officer assignment, saved notes, incomplete handoff denial and successful field handoff |
| Field verification | Draft recovery/save, valid visit dates, verification checks, resolved questions and report submission |
| Caseworker review | Evidence acknowledgements, submitted field report requirement, unresolved-issue denial and final handoff |
| Approval/rejection | Four-stage manual processing; confirmation required; rejection reason required; final decision locks and idempotent retries |
| Return/resume | Every stage, nested returns, correction destinations, reasons, refreshed sign-offs and legacy-case recovery |
| Audit history | Exact stage/version chain, actor snapshots, timestamps, saved notes, sequence ordering, before/after state, retry deduplication and tamper denial |
| Kannada/English | Catalog/placeholder checks, localized validation, cookie persistence, refresh/new tabs, language-change failure recovery and Kannada workflow |
| Gemini assistance | Real HTTP authorization/configuration checks; official SDK exercised with in-memory transport; all four browser panels use explicitly intercepted success fixtures |
| AI failures | Missing key, 429, timeout, network/provider errors, malformed/blocked output, stale context, retained drafts and successful manual save after configuration failure |
| Mobile screens | Chromium emulation at 360/390/768/1024/1440px; both languages at 360/390/768/1440px; navigation, overflow, clipping, focus, font loading and touch controls |

The browser evidence covers all seven configured scenarios, including the corrected route scenario and its checks for all four roles.

## Security findings

| Control | Executed result |
| --- | --- |
| Supabase RLS/grants | All eight application/configuration tables have RLS; anonymous reads and untrusted direct writes denied; all three read-model views use caller rights |
| Server authorization | Verified identity plus active database profile; independent page/action/API checks; database role, jurisdiction, stage and named-assignment enforcement |
| Role escalation | Profile insertion/role update, Auth metadata role claims and browser role claims cannot grant approval rights |
| Unauthorized transitions | Stage skipping, wrong role/assignment, incomplete evidence, missing confirmation, stale writes and reopening closed cases rejected |
| Revoked sessions | Replayed, still-unexpired JWT cannot approve or read the case after its Auth session is revoked |
| Invalid input/API requests | Strict schemas, bounded fields/body, real calendar-date checks, malformed direct RPC JSON, unsupported methods, unknown fields and cross-origin request rejection |
| Secrets/logs | Application uses the caller's publishable-key session; administrator key stays in setup/tests; provider errors are sanitized; no application logging of keys, credentials or provider payloads found in source review |
| Stored XSS | Application notes/names and intercepted AI output remain text; injected image/event-handler payload does not execute |
| Audit tampering | Direct officer event writes denied; append-only trigger rejects maintenance updates; private schema and workflow engine inaccessible to officer clients |
| Duplicate/inconsistent writes | Version checks and row locks reject stale/concurrent writes; lost-response retry creates one decision; forced audit-insert failure rolls back checklist, workflow, version and receipt together |
| AI isolation | Generation has no workflow-mutation capability; database quota is shared per officer; role/access/version rechecked after generation |

The tested database includes security migrations `20261030000600_security_review.sql` and `20261030000610_session_revocation.sql`. Hosted deployments need these migrations as well as the earlier workflow migrations for the same guarantees.

## Critical end-to-end evidence

The 25-test live integration run completed the fictional chain `SUBMITTED → FIELD_VERIFICATION → UNDER_REVIEW → PENDING_APPROVAL → APPROVED`, and a separate fully reviewed chain ended in `REJECTED`. The approval test verifies the exact audit transition chain, per-action version increments, authenticated actors and unchanged history on retry. Return/resume tests cover all stages and nested clarification without skipping the requesting officer's stage. The English browser walkthrough completed approval and a returned case ending in rejection; the Kannada browser walkthrough also completed clarification and a human-confirmed final decision.

## Verification limits

- No Gemini API key is configured. **Live successful Gemini generation was not executed.** Successful browser suggestions are intercepted fixtures, and SDK/provider failure tests use an in-memory HTTP transport. The real missing-configuration endpoint and subsequent manual save were exercised.
- Responsive checks use desktop Chromium emulation. Physical Android/iOS devices, Firefox, Safari and production-hosted infrastructure were not tested.
- The dependency audit covers production dependencies and the advisory database available at execution time.
- Local checks exercise the existing migrated database. A fresh database reset and a hosted migration rollout were not performed.

Test applications are temporary and cleaned up by the suites. SQL fault-injection/quota checks roll back. A final read-only database check confirmed exactly 12 demonstration applications and one active profile for each of the four roles.

## Assessment

No critical workflow defect or unauthorized approval path was reproduced in the tested scope. Four-stage decisions, accurate audit history, return/resume, manual processing during AI failure, and main mobile screens passed the checks described above. Successful live Gemini generation remains unverified until a real key is configured.
