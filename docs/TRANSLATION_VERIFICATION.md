# Translation coverage and verification

Updated 1 November 2026 (Asia/Kolkata).

The reported untranslated content was applicant names, villages and saved notes. Interface and known demonstration labels now follow the locale, and custom saved text has an explicitly requested Gemini reading view. Stored records always retain their original content.

## Changes

- Known certificate codes, including `INCOME`, and known document-type labels use the selected locale.
- Mysuru district/taluk labels and the four supplied demo-village labels follow the locale in the header, dashboard, filters, account details, application details and read-only intake fields.
- Supplied demo applicant/officer labels follow the locale in lists, mobile cards, details, assignments, confirmation dialogs and audit actor display.
- The supplied bilingual demo purposes, disclaimer notes, unresolved-action labels and legacy field report display their reviewed translation for the selected locale.
- Real applicant names, custom village names, officer-entered notes, file names, saved workflow evidence and unknown values retain their original content. Only exact known demo text is mapped, and case-content mappings additionally require the application's demo flag.
- Filter option values and submitted fields remain canonical even when their visible label changes. No database migration or record rewrite is involved.
- Searching an English demo-applicant label also searches its original Kannada label, scoped to demo rows. Literal user-name and reference searches remain available and escaped as before.

## Gemini reading view

On application details, use **Translated reading view**:

1. Select a saved name, place, purpose, workflow note, document note or saved case note.
2. Click **Translate saved text**. The interface language determines the target: Kannada or English.
3. Compare the reading translation with the original shown beside it. Proper names and places are transliterated into the target script.

Generation is on demand. Selecting a field or switching language does not call Gemini. Switching language hides a translation in the previous language; click again to request the new one. The original remains visible while loading or on failure, and ordinary manual workflow controls remain available. A failed retry retains a previous usable translation, unless access/source checks invalidate it. Selecting another field clears the previous translation. Nothing is written to browser storage or the database by this feature.

The server uses the existing private `GEMINI_API_KEY` and optional `GEMINI_MODEL`. No new credentials, database repair or migration are needed. Existing interface translations and reviewed demonstration mappings work without Gemini.

### Access, privacy and validation

- `POST /api/applications/[id]/translation` accepts only a saved version, selected field key and target language. Browser-supplied source text and workflow commands are rejected.
- Active officers can translate only cases readable through their own Supabase session and RLS. This read capability works across stages, including closed cases, without granting decision powers. The implementation uses no administrator credentials.
- Only the selected saved text is sent to Gemini after the officer clicks the button. This can explicitly include a selected applicant name or place. Application/note IDs, adjacent fields, officer identities, files and audit history are not included in the provider request. Free text can itself contain identifiers; the panel describes the external transfer before generation.
- Source is limited to 4,000 characters. Strict JSON/schema validation pins the language; numeric-token checks reject added, changed or dropped written numbers. Kannada and Western numerals and grouping commas are normalized for comparison. Provider calls have a 30-second timeout, no automatic retry, and no tools.
- Authorization, workflow version, application timestamp and the selected source are checked again after generation. Changes discard the response. Responses use private/no-store headers; source text, translated output and provider errors are not logged.
- A bounded in-memory limiter allows six attempts per officer per minute and one request in flight. It is **per server process**, resets on restart and is not a distributed quota. The four workflow assistants retain their existing shared database quota.
- There are no save, apply, approve or return actions in the reading panel. Translations live only in component memory and are separate from official evidence and audit history.

Machine translation and name transliteration can be wrong. The numeral guard and JSON validation do not establish semantic accuracy, correct negation or identity. The panel labels output as a reading aid and retains the original for verification. Production rollout would require approved handling of selected case text and a shared quota if multiple server instances are used.

## Verification

- Unit tests: **65 tests across 11 files passed**. Ten new reading tests cover field projection/original preservation, strict requests, authentication/access, stale source and revoked sessions, read-only response behavior, rate/concurrency limits, SDK transport and minimal payload, malformed output, numeric-fact preservation, provider errors and timeouts. Existing locale/filter, AI and workflow unit checks also passed.
- TypeScript route generation and type check: passed.
- ESLint: the full repository check passed with zero warnings.
- Production build and **12 authenticated integration tests passed** in the local verification runner. The reading endpoint checks anonymous/method/origin rejection, strict input, stale versions and honest missing-key failures, including access on a closed case.
- Expanded browser coverage: **all 7 scenarios passed**. Reading checks use intercepted success/failure responses plus the real missing-key endpoint to verify selected-field requests, original preservation, language switching, retries, cooldown, unchanged database snapshots and manual continuation. The other checks cover Kannada/English across screens, unsaved text preservation, translated demo labels and existing workflow/AI behavior.
- **Four real Gemini SDK translation checks passed**, covering fictional names and notes in both directions. Run `npm run test:translation:live` with Node 22 and a private key in `.env.local`. It sends four billable requests, validates output/numbers and prints only result metadata; it never connects to Supabase.
- **A separate real authenticated browser translation passed** against a temporary fictional local case: English note to Kannada, number preserved, original still visible, application/workflow/notes/events unchanged. Desktop and 360px mobile screenshots were inspected; no horizontal overflow was detected. The temporary case and server were removed afterward. This is distinct from the browser suite's intercepted responses.
- Secret-exposure scan: passed after the final production build.
- Authenticated local API searches for English demo names and the original Kannada names both resolved the same original demonstration case. These probes were read-only.

`npm run test:ai:local` runs the build, authenticated integration and seven browser scenarios against disposable local Supabase, using ignored local test credentials and a blank Gemini key. It includes the reading endpoint/UI checks. Its build embeds local public configuration; rebuild normally before starting or deploying the hosted configuration.

The hosted database and private environment file were not modified by these checks. Authenticated translation on a hosted deployment and human-reviewed translation accuracy remain unverified.
