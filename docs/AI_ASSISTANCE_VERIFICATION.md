# Gemini assistance implementation and verification

Updated 1 November 2026 (Asia/Kolkata).

The existing Next.js 16.4.3 App Router application, Supabase sessions/RLS, four officer roles, workflow controls and history are preserved. No schema migration or extra officer role is needed for this change. Earlier Phase 6/7 reports describe their historical runs; this document records the current AI work.

## Implemented behavior

- Screening receives saved application facts, required/received checklist counts, screening notes, case notes and clarification context. It drafts a clarification message using recorded receipt gaps.
- Field verification now also receives application facts, screening evidence and saved case notes alongside the recorded visit, observations, verification status/checks and unresolved questions. It drafts a report without inferring an unrecorded visit.
- Caseworker review consolidates saved evidence, field information, notes and unresolved issues into an editable review draft.
- Final decision provides neutral evidence and issue summaries. Optional human-selected intent is explicitly a drafting input; the AI cannot select or submit a decision.
- All responses include stage, language, summary, evidence, missing information, inconsistencies, follow-up questions, unverified information, an editable draft and limitations. Stage/language are constrained in the provider's JSON schema and checked again on the server/client. Drafts fit the existing 4,000-character manual fields.
- The shared panel includes stage descriptions, generate/regenerate, loading, editable drafts, copy, limitations, error/retry and cooldown states. Failed regeneration preserves edits. The output language follows interface changes while preserving existing edited text; an explicit panel override remains available. In-flight generation is canceled on interface-language changes.
- Saving remains explicit: copy the draft into the relevant workflow notes, review it, then save with the existing controls. Generation/copying cannot write notes, receipts, sign-offs, statuses, decisions or history.

## Backend and limits

The existing `POST /api/applications/[id]/ai/[feature]` route is reused. It accepts only the saved version, language and optional final-stage human intent. Server data comes from the caller's Supabase session with RLS. Authentication, active role, assignment, stage and saved version are checked before generation and again afterward. The projected case evidence is also compared afterward to detect changed notes/checklists.

The official Google GenAI SDK uses a server key, stage-specific instructions, JSON-schema output, an 8,192-token output budget, a 30-second timeout and a single provider attempt. The existing database quota remains six attempts per officer per 60 seconds. No tools or workflow-write dependencies are supplied to the model. Provider failures are sanitized without logging keys, prompts or responses.

More than 20 saved case notes or more than 32,000 projected context characters produces a manual-continuation error rather than silently dropping evidence. Structured identifiers, names, locations, file paths and credentials are excluded from context. Free text still contains whatever the officer entered; use fictional records for evaluation.

## Configuration and commands

Use Node 22.12+ within major 22. Put the real key only in ignored `.env.local` or server hosting settings:

```dotenv
GEMINI_API_KEY=your_private_google_ai_studio_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart the application after configuration changes. `.env.example` contains no key.

```powershell
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm run test:ai:live
npm run test:ai:local
```

`test:ai:live` performs eight real, billable provider requests using fictional data, one per stage/language combination. It does not access Supabase and prints only pass/failure metadata.

`test:ai:local` requires Docker and a running, already migrated/seeded local Supabase project (`npm run db:start`). It forces localhost Supabase configuration, provisions only marked local demo accounts with passwords in ignored `.env.ai.local`, builds the app and starts a temporary production server on port 3002. It runs the AI/workflow integration tests and four relevant browser suites, then stops its server. Tests remove their temporary cases. It does not reset the database, migrate a hosted project or load/modify hosted configuration. Successful AI browser responses are explicitly intercepted fixtures; a blank key exercises the actual missing-configuration endpoint and manual continuation.

## Executed results

- Unit tests: **53 passed across 10 files**, including 11 AI tests. These cover all eight SDK stage/language combinations, wrong stage/language, notes changing during generation, request validation, authentication/assignment denial, missing configuration, provider failures, unsafe output and no case mutation.
- Live Gemini: **8/8 passed**, all four assistants in Kannada and English with fictional data, using the configured key and model. Responses passed the same output validator used by the application. No response contents are logged.
- ESLint: repository-wide check passed with zero warnings, including the local runner. Subsequent provider/script changes passed targeted lint.
- The running development server returned **200** for `/login`, **307** for an anonymous `/dashboard` request and **401 JSON** for an anonymous AI POST.
- Production build: passed on Next.js 16.4.3 / Node 22.23.3, including TypeScript and route generation. Both the local verification build and the final build with the user's normal `.env.local` settings passed. The final artifact no longer uses the local test configuration.
- Authenticated HTTP/database integration: **11 passed, zero skipped**. Includes AI request validation, missing-key errors, manual approval/rejection, all-stage and nested return/resume, exact audit history, idempotency, stale/concurrent writes and revoked-session denial.
- Playwright: **all 6 scenarios passed in the final full run** against the production server using local Supabase. Includes all four AI panels, both output languages, edited/copyable drafts, failed-regeneration recovery, cooldown/retry, retained drafts across interface changes, unchanged workflow/history, English/Kannada manual completion, mobile layouts, role boundaries, escaped untrusted text and logout cleanup.
- Secret scan: passed; configured private values absent from generated client, test and log artifacts, with the Gemini SDK/test transport absent from client code. Private environment and runtime files are ignored by Git.

The initial sandbox build failed when a compiler subprocess used system Node 20. Clearing only the generated Turbopack caches and explicitly setting the child-process Node 22 path resolved compilation. A subsequent TypeScript error in the new environment helper was corrected. The first browser run had five passes and one language-dependent test-locator failure; the stable draft identifier fixed that assertion, and the full rerun passed all six. One intermediate live run rejected an unusable provider response; the final eight-call run passed. These failures were handled without fabricating suggestions or committing a workflow decision.

## Remaining limits

Live SDK success is separate from authenticated hosted-endpoint verification. A deployed application URL and hosted four-role walkthrough remain unverified. Local browser tests use Chromium, not physical field devices. Prompt constraints, schema validation and output checks reduce errors but do not prove factual accuracy or translation quality; officers must verify every draft. This prototype does not establish authenticity, eligibility or measured operational impact.

## Files in this change

Created:

- `lib/ai/config.ts` — reusable validated server/script configuration.
- `scripts/test-gemini-live.ts` — eight real provider checks with fictional data.
- `scripts/test-ai-local.mjs` — isolated local production-build, integration and browser runner.
- `docs/AI_ASSISTANCE_VERIFICATION.md` — current implementation, commands, evidence and limits.

Modified:

- `lib/ai/contracts.ts`, `context.ts`, `gemini-provider.ts`, `handler.ts` — typed responses, complete saved context, prompts, output checks and fresh-evidence checks.
- `services/ai.ts` — shared configuration and RLS-scoped saved-note retrieval.
- `components/ai-assistant-panel.tsx` — descriptions, limitations, regenerate, language synchronization and draft handling.
- `lib/i18n/en.json`, `lib/i18n/kn.json` — matching English/Kannada messages.
- `tests/ai.test.ts`, `tests/browser/phase-four.spec.ts`, `tests/browser/phase-six.spec.ts` — SDK/API checks and updated browser coverage.
- `.env.example`, `package.json`, `README.md` — configuration placeholders, verification commands and usage documentation.
- `docs/EVALUATOR_DEMO.md`, `docs/FINAL_EVALUATION.md`, `docs/SUBMISSION_EMAIL.md` — current labels and live-provider evidence.

The privately configured `.env.local`, local test passwords in `.env.ai.local` and `.qa/` runtime helpers/logs are ignored and are not submission artifacts. Pre-existing intake and login work in the workspace was preserved.
