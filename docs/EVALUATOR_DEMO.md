# Five-minute evaluator walkthrough

Submission deadline: **Monday, 2 November 2026**. This walkthrough demonstrates an independent fictional prototype; it does not issue a government certificate or replace Nadakacheri.

## Prepare before the five-minute timer

1. Complete the [README setup](../README.md) using a dedicated demonstration project, all migrations and both seed files. Run `npm run demo:setup` once to provision the four trusted accounts. Supply four distinct passwords in ignored `.env.local`; never put passwords in the recording or repository. Re-running account setup resets those supplied demo passwords and assignments, so finish setup before rehearsing.
2. Set `SEVASATHI_TEST_DEMO_PROJECT=true` only for this disposable demonstration project, then run `npm run demo:case` for a fresh walkthrough case. Record its printed reference and relative `/applications/<id>` path. The command inserts one new fictional case at document screening and verifies its four role assignments. It does not reset earlier decisions or overwrite the twelve seeded applications.
3. Open four separate browser profiles or isolated browser contexts. Ordinary tabs share the same session and are unsuitable for simultaneous roles. Sign in to the downstream accounts beforehand and keep the operator's login page ready to show a real login during the walkthrough.

| Context | Account | Responsibility |
| --- | --- | --- |
| Operator | `operator@sevasathi.example.com` | Screening and assignments |
| Field officer | `field.officer@sevasathi.example.com` | Fictional field report |
| Caseworker | `caseworker@sevasathi.example.com` | Consolidated review |
| Approving officer | `approving.officer@sevasathi.example.com` | Explicit final human decision |

4. In every context, use the same freshly printed case path. Refresh it after the previous role hands off. Later-stage seeded examples intentionally lack historical manual sign-offs; they are unsuitable as a shortcut to a new approval. Closed decisions remain locked. Create another fresh demo case for each rehearsal instead of resetting audit history.
5. For live AI, configure a server-only `GEMINI_API_KEY` and an available `GEMINI_MODEL`, restart/redeploy, and preflight real generation before recording. Eight live SDK checks passed on 1 November 2026 using fictional data, covering every stage in Kannada and English; the actual hosted authenticated endpoint still needs its own preflight. Each role's panel uses saved facts; save manual entries before generating. Keep the interface in English for the click labels below, then show the Kannada toggle during the history segment.
6. Rehearse against the actual endpoint. AI calls can take up to 30 seconds each; this five-minute schedule is a presentation budget, not a performance claim. If a call is slow or fails, show its actual state briefly and continue manually. Never substitute fixture output or present a mock response as live Gemini output.

The first `demo:case` adds an extra fictional application, so workload counts may differ from the original twelve-record fixture. The live test suites expect the original fixture dataset; use a separate evaluation project or complete QA before adding evaluator cases.

## Timed walkthrough — exactly 5:00

| Time | Show and do | Explain |
| --- | --- | --- |
| 0:00–0:25 | Sign in as the operator with the supplied password. Do not reveal it on screen. | “SevaSathi assists provisioned revenue officers. Roles come from the trusted database profile; this is a fictional prototype.” |
| 0:25–0:50 | Show the pending dashboard, one priority/overdue explanation and the Applications list. Search for the fresh case's reference and open it. | Counts come from the officer's authorized database scope. Targets are configurable demo thresholds, not official deadlines. |
| 0:50–1:40 | In document screening, mark the three demonstration checklist items **Received**, add screening notes and confirm the downstream officers. **Save progress**. Open AI Assistance and select the output language, then **Generate AI Assistance**. Inspect the summary, limitations and editable draft. Copy a reviewed draft into the manual notes and explicitly save if using it. Click **Send to field**. | Receipt is an officer declaration, not proof of document authenticity. AI uses saved checklist information, cannot advance the case, and its text must be checked for invented evidence. A human checks any draft before using it in a manual note. |
| 1:40–2:35 | Switch to the field officer context and refresh the same case. Choose today's visit date for the fictional scenario, select **Verified**, enter clearly labelled simulated observations and tick identity/residence/income checks. Leave follow-up questions empty for this straight-through case. Save the draft, request field AI, inspect its actual result/error, then **Submit field report**. | The assistant can structure an entered report; it does not perform or prove a visit. The manual handoff requires saved evidence declarations and completed checks. |
| 2:35–3:25 | Switch to the caseworker and refresh. Review the saved screening and field sections. Enter review notes, tick the three review acknowledgements and leave unresolved issues empty for this example. Save, request review AI and inspect the actual result/error, then **Forward to decision**. | The caseworker reviews the consolidated record. Recorded unresolved issues block forwarding until resolved or returned for clarification. |
| 3:25–4:15 | Switch to the approving officer and refresh. Show the consolidated records. In decision AI, optionally choose a human-intended action and give a fictional rationale; generate and inspect a neutral draft/error. In the manual workflow, enter the human's reason, choose **Approve**, show the confirmation, then confirm it. | Choosing an action for AI drafting does not decide the application. Only the assigned approving officer's explicit, confirmed manual action commits the final decision. Rejection likewise requires a reason; AI never recommends or executes a decision. |
| 4:15–5:00 | Show the locked final decision and Application history. Point to the four stage changes, saved actions, actor roles, time and decision reason. Toggle Kannada, then English, and show that saved notes/history remain the same. Show the narrow layout if rehearsed or resize briefly. | “The audit trail records who did what. Language changes translate system labels, not officer notes. Manual processing still works when AI is unavailable. Pilot benefits have not been measured.” |

## Safe fictional example notes

Use these as entered scenario facts, then inspect any AI text before copying it. They describe fictional activity only.

- Screening: “Fictional walkthrough: demonstration receipt metadata checked; all three required demonstration items recorded.”
- Field observations: “Fictional scenario: simulated visit record; identity, residence and declared income checked against the supplied scenario facts.”
- Review: “Fictional scenario: reviewed document receipts, the simulated field report and declared income; no unresolved issues recorded for this example.”
- Human decision reason: “Fictional walkthrough only: human approval after reviewing the recorded manual checks.”

Do not select **Verified** or tick confirmations against real citizen data merely to complete a demo. This script uses a dedicated fictional case.

## When AI is unavailable

Click generation at each stage to show the actual configuration/error state for that environment and continue with the manual fields. A retained draft or an intercepted browser-test fixture is not evidence of a live provider response. The production workflow has no fabricated success fallback. See [current AI verification](AI_ASSISTANCE_VERIFICATION.md) for the distinction between successful live SDK checks and hosted-endpoint verification.

## Optional follow-up outside the five-minute walkthrough

For return/resume, create another fresh case and send it to field verification. As the field officer, enter a clarification reason and choose **Return**. As the operator, read the displayed return/resume destinations, record the correction and resolution reason, then choose **Resume**. Refresh the field officer's context and continue the required checks. History should show both the clarification and resume actions. Use the Phase 6 automated evidence for nested returns, rejection, stale writes and retry deduplication; do not claim those paths were all shown in the five-minute recording.

After the walkthrough, sign out from all four contexts. Preserve the closed fictional case as review evidence; start a new case for another rehearsal. Share account passwords privately through the evaluator's approved channel, separate from the repository and walkthrough recording.
