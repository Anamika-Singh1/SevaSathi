import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_USERS } from "../../scripts/demo-users";
import type { Database, Json } from "../../types/database";
import type { Role } from "../../lib/roles";

let admin: SupabaseClient<Database>;
const clients = new Map<Role, SupabaseClient<Database>>();
const officers = new Map<Role, string>();
const fixtureIds: string[] = [];
let sequence = Date.now() % 9000000;
const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);

before(async () => {
  assert.equal(
    process.env.SEVASATHI_TEST_DEMO_PROJECT,
    "true",
    "Use a disposable seeded demo project.",
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  assert.ok(url && key && process.env.SUPABASE_SECRET_KEY);
  admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const definition of DEMO_USERS) {
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await client.auth.signInWithPassword({
      email: definition.email,
      password: process.env[definition.passwordEnv]!,
    });
    assert.equal(result.error, null);
    clients.set(definition.role, client);
    officers.set(definition.role, result.data.user!.id);
  }
});
after(async () => {
  if (fixtureIds.length)
    assert.equal(
      (await admin.from("applications").delete().in("id", fixtureIds)).error,
      null,
      "Fixture cascade must preserve audit protection on unrelated applications",
    );
  await Promise.all(
    [...clients.values()].map((client) =>
      client.auth.signOut({ scope: "local" }),
    ),
  );
});

async function fixture() {
  const result = await admin
    .from("applications")
    .insert({
      reference_number: `SS-2098-${++sequence}`,
      applicant_name: "ಮಾದರಿ ಕಾರ್ಯಪ್ರವಾಹ ಪರೀಕ್ಷೆ",
      village: "Workflow demo village",
      district: "ಮೈಸೂರು",
      taluk: "ಮೈಸೂರು",
      annual_income: 48000,
      purpose: "Disposable manual workflow test",
      is_demo: true,
      created_by: officers.get("OPERATOR")!,
      submitted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    })
    .select("id")
    .single();
  assert.equal(result.error, null);
  fixtureIds.push(result.data!.id);
  return result.data!.id;
}
async function state(id: string) {
  const work = await admin
    .from("application_workflow")
    .select("*")
    .eq("application_id", id)
    .single();
  assert.equal(work.error, null);
  return work.data!;
}
async function events(id: string) {
  const result = await admin
    .from("application_events")
    .select("*")
    .eq("application_id", id)
    .order("created_at")
    .order("sequence");
  assert.equal(result.error, null);
  return result.data!;
}
async function act(
  id: string,
  role: Role,
  action: string,
  payload: Json = {},
  version?: number,
  requestId = randomUUID(),
) {
  return clients.get(role)!.rpc("workflow_action", {
    target_id: id,
    action,
    payload,
    expected_version: version ?? (await state(id)).version,
    request_id: requestId,
  });
}
async function screen(id: string) {
  const list = await admin
    .from("application_checklist")
    .select("key")
    .eq("application_id", id);
  return {
    screening_notes: "Documents received and screened manually.",
    checklist: list.data!.map((item) => ({
      key: item.key,
      status: "RECEIVED",
      note: "Demo receipt checked",
    })),
    field_officer_id: officers.get("FIELD_OFFICER")!,
    caseworker_id: officers.get("CASEWORKER")!,
    approving_officer_id: officers.get("APPROVING_OFFICER")!,
  };
}
const field = () => ({
  verification_status: "VERIFIED",
  visit_date: today(),
  field_observations:
    "Visited the applicant and verified declared income and residence.",
  verification_checks: {
    identity_confirmed: true,
    residence_confirmed: true,
    income_assessed: true,
  },
});
const review = () => ({
  caseworker_notes:
    "Reviewed application, all documents and the submitted field report.",
  review_checks: {
    documents_reviewed: true,
    field_report_reviewed: true,
    income_reviewed: true,
  },
});
async function advanceToDecision(id: string) {
  assert.equal(
    (await act(id, "OPERATOR", "ADVANCE", await screen(id))).error,
    null,
  );
  assert.equal(
    (await act(id, "FIELD_OFFICER", "ADVANCE", field())).error,
    null,
  );
  assert.equal((await act(id, "CASEWORKER", "ADVANCE", review())).error, null);
}

test("direct workflow RPC rejects malformed JSON field types without changing records or history", async () => {
  const id = await fixture();
  const beforeState = await state(id);
  const beforeEvents = await events(id);
  for (const payload of [
    { reason: { invented: "structured reason" } },
    { reason: null },
    { confirmed: "true" },
    { screening_notes: ["not text"] },
    { field_officer_id: "not-a-uuid" },
    { checklist: [null] },
    { checklist: [{ key: "income_declaration", status: "RECEIVED", note: { unexpected: "object" } }] },
    { checklist: [{ key: "income_declaration", status: "RECEIVED", note: "valid note", actor_id: officers.get("OPERATOR") }] },
  ]) {
    const result = await act(id, "OPERATOR", "SAVE", payload as Json);
    assert.ok(result.error, `Malformed payload accepted: ${JSON.stringify(payload)}`);
    assert.equal(result.error.message, "WORKFLOW_INVALID_INPUT");
    assert.deepEqual(await state(id), beforeState);
    assert.deepEqual(await events(id), beforeEvents);
  }
  assert.equal((await act(id, "OPERATOR", "ADVANCE", await screen(id))).error, null);
  const beforeField = await state(id), fieldEvents = await events(id);
  for (const payload of [
    { visit_date: "today" }, { visit_date: "2026-02-31" }, { visit_date: null },
    { verification_checks: null }, { verification_checks: { identity_confirmed: "true" } },
    { follow_up_resolved: "false" }, { follow_up_questions: { forged: "object" } },
  ]) {
    const result = await act(id, "FIELD_OFFICER", "SAVE", payload as Json);
    assert.equal(result.error?.message, "WORKFLOW_INVALID_INPUT", JSON.stringify(payload));
    assert.deepEqual(await state(id), beforeField);
    assert.deepEqual(await events(id), fieldEvents);
  }
  assert.equal((await act(id, "FIELD_OFFICER", "ADVANCE", field())).error, null);
  const beforeReview = await state(id), reviewEvents = await events(id);
  for (const payload of [{ review_issues: null }, { caseworker_notes: {} }, { review_issues_resolved: 1 }]) {
    assert.equal((await act(id, "CASEWORKER", "SAVE", payload)).error?.message, "WORKFLOW_INVALID_INPUT");
    assert.deepEqual(await state(id), beforeReview);
    assert.deepEqual(await events(id), reviewEvents);
  }
  assert.equal((await act(id, "CASEWORKER", "ADVANCE", review())).error, null);
  const beforeDecision = await state(id), decisionEvents = await events(id);
  assert.equal((await act(id, "APPROVING_OFFICER", "REJECT", { confirmed: true, reason: { fabricated: "reason" } })).error?.message, "WORKFLOW_INVALID_INPUT");
  assert.deepEqual(await state(id), beforeDecision);
  assert.deepEqual(await events(id), decisionEvents);
});

test("a revoked session's still-unexpired JWT cannot approve or read a case", async () => {
  const id = await fixture();
  await advanceToDecision(id);
  const beforeState = await state(id), beforeEvents = await events(id);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const session = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const definition = DEMO_USERS.find(user => user.role === "APPROVING_OFFICER")!;
  const loggedIn = await session.auth.signInWithPassword({ email: definition.email, password: process.env[definition.passwordEnv]! });
  assert.equal(loggedIn.error, null);
  const token = loggedIn.data.session!.access_token;
  const replay = createClient<Database>(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal((await session.auth.signOut({ scope: "local" })).error, null);
  const approval = await replay.rpc("workflow_action", { target_id: id, action: "APPROVE", expected_version: beforeState.version, request_id: randomUUID(), payload: { confirmed: true, reason: "Replay of a revoked session must fail." } });
  assert.ok(approval.error, "A revoked session JWT was accepted for approval");
  assert.deepEqual(await state(id), beforeState);
  assert.deepEqual(await events(id), beforeEvents);
  const records = await replay.from("applications").select("id").eq("id", id);
  assert.ok(records.error || records.data?.length === 0, "Revoked session still reads case records");
});

test("manual approval: drafts persist, all four roles advance, decisions lock and retries are idempotent", async () => {
  const id = await fixture();
  const draft = await screen(id);
  draft.checklist[0].status = "MISSING";
  assert.equal((await act(id, "OPERATOR", "SAVE", draft)).error, null);
  assert.equal((await state(id)).screening_notes, draft.screening_notes);
  assert.ok((await act(id, "OPERATOR", "ADVANCE", draft)).error);
  assert.equal(
    (await act(id, "OPERATOR", "ADVANCE", await screen(id))).error,
    null,
  );
  assert.equal((await act(id, "FIELD_OFFICER", "SAVE", field())).error, null);
  assert.equal((await state(id)).field_submitted_at, null);
  assert.equal(
    (await act(id, "FIELD_OFFICER", "ADVANCE", field())).error,
    null,
  );
  assert.equal((await act(id, "CASEWORKER", "SAVE", review())).error, null);
  assert.equal((await act(id, "CASEWORKER", "ADVANCE", review())).error, null);
  assert.ok(
    (await act(id, "APPROVING_OFFICER", "APPROVE", { confirmed: false })).error,
  );
  assert.ok(
    (
      await act(id, "APPROVING_OFFICER", "REJECT", {
        confirmed: true,
        reason: " ",
      })
    ).error,
  );
  const version = (await state(id)).version,
    requestId = randomUUID(),
    payload = { confirmed: true, reason: "All manual checks completed." };
  assert.equal(
    (await act(id, "APPROVING_OFFICER", "APPROVE", payload, version, requestId))
      .error,
    null,
  );
  const history = await events(id),
    snapshot = await state(id);
  assert.ok(snapshot.decided_at);
  assert.equal(snapshot.decided_by, officers.get("APPROVING_OFFICER"));
  assert.equal(
    (await admin.from("applications").select("status").eq("id", id).single())
      .data!.status,
    "APPROVED",
  );
  const retry = await act(
    id,
    "APPROVING_OFFICER",
    "APPROVE",
    payload,
    version,
    requestId,
  );
  assert.equal(retry.error, null);
  assert.equal((retry.data as { duplicate: boolean }).duplicate, true);
  assert.equal((await events(id)).length, history.length);
  assert.ok((await act(id, "OPERATOR", "SAVE", await screen(id))).error);
  assert.ok(
    (
      await act(
        id,
        "APPROVING_OFFICER",
        "APPROVE",
        { confirmed: true, reason: "Changed request" },
        version,
        requestId,
      )
    ).error,
  );
  for (const type of [
    "APPLICATION_CREATED",
    "CHECKLIST_CHANGED",
    "SCREENING_SAVED",
    "DOCUMENT_SCREENED",
    "FIELD_DRAFT_SAVED",
    "FIELD_REPORT_SUBMITTED",
    "CASEWORKER_REVIEW_SAVED",
    "CASEWORKER_REVIEWED",
    "STAGE_CHANGED",
    "APPROVED",
  ])
    assert.ok(
      history.some((event) => event.event_type === type),
      type,
    );
  for (const event of history) {
    assert.ok(
      event.actor_name &&
        event.actor_role &&
        event.created_at &&
        event.event_type,
    );
    if (event.request_id) {
      assert.ok(event.actor_id);
      assert.equal(event.actor_id, officers.get(event.actor_role as Role));
    }
  }
  assert.deepEqual(
    history.filter((event) => event.event_type === "STAGE_CHANGED").map((event) => [
      (event.previous_state as { stage: string }).stage,
      (event.new_state as { stage: string }).stage,
    ]),
    [
      ["SUBMITTED", "FIELD_VERIFICATION"],
      ["FIELD_VERIFICATION", "UNDER_REVIEW"],
      ["UNDER_REVIEW", "PENDING_APPROVAL"],
      ["PENDING_APPROVAL", "APPROVED"],
    ],
    "Audit transitions must record the exact four-stage chain",
  );
  const actions = [
    "SCREENING_SAVED", "DOCUMENT_SCREENED", "FIELD_DRAFT_SAVED",
    "FIELD_REPORT_SUBMITTED", "CASEWORKER_REVIEW_SAVED", "CASEWORKER_REVIEWED", "APPROVED",
  ];
  const actionHistory = history.filter((event) => actions.includes(event.event_type));
  assert.deepEqual(actionHistory.map((event) => event.event_type), actions);
  assert.equal(new Set(actionHistory.map((event) => event.request_id)).size, actions.length);
  for (const [index, event] of actionHistory.entries()) {
    assert.equal((event.previous_state as { version: number }).version, index);
    assert.equal((event.new_state as { version: number }).version, index + 1);
    if (index > 0) assert.ok(event.sequence > actionHistory[index - 1].sequence);
  }
  assert.ok(
    (
      await admin
        .from("application_events")
        .update({ description: "Forged" })
        .eq("application_id", id)
    ).error,
    "Even service maintenance cannot rewrite history",
  );
});

test("return and resume at every stage preserve work, require reasons and return to the requesting stage", async () => {
  const id = await fixture();
  assert.ok((await act(id, "OPERATOR", "RETURN", {})).error);
  assert.equal(
    (
      await act(id, "OPERATOR", "RETURN", {
        reason: "Applicant must clarify the income declaration.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).resume_status, "SUBMITTED");
  assert.ok((await act(id, "OPERATOR", "ADVANCE", await screen(id))).error);
  assert.equal(
    (
      await act(id, "OPERATOR", "RESUME", {
        ...(await screen(id)),
        reason: "Applicant supplied the clarification.",
      })
    ).error,
    null,
  );
  assert.equal(
    (await act(id, "OPERATOR", "ADVANCE", await screen(id))).error,
    null,
  );
  assert.equal(
    (
      await act(id, "FIELD_OFFICER", "RETURN", {
        reason: "Please correct the residence document.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).resume_status, "FIELD_VERIFICATION");
  assert.equal(
    (
      await act(id, "OPERATOR", "RESUME", {
        ...(await screen(id)),
        reason: "Corrected residence document received.",
      })
    ).error,
    null,
  );
  assert.equal(
    (await act(id, "FIELD_OFFICER", "ADVANCE", field())).error,
    null,
  );
  assert.equal(
    (
      await act(id, "CASEWORKER", "RETURN", {
        reason: "Please add the income assessment details.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).resume_status, "UNDER_REVIEW");
  assert.equal(
    (
      await act(id, "FIELD_OFFICER", "RESUME", {
        ...field(),
        reason: "Additional income assessment recorded.",
      })
    ).error,
    null,
  );
  assert.equal((await act(id, "CASEWORKER", "ADVANCE", review())).error, null);
  assert.equal(
    (
      await act(id, "APPROVING_OFFICER", "RETURN", {
        reason: "Explain the discrepancy in the review.",
        confirmed: true,
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).resume_status, "PENDING_APPROVAL");
  assert.equal(
    (
      await act(id, "CASEWORKER", "RESUME", {
        ...review(),
        reason: "Discrepancy reviewed and explained.",
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await act(id, "APPROVING_OFFICER", "REJECT", {
        confirmed: true,
        reason: "Evidence does not substantiate the declared income.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).clarification_pending, false);
  const history = await events(id);
  assert.equal(
    history.filter((event) => event.event_type === "RETURNED_FOR_CLARIFICATION")
      .length,
    4,
  );
  assert.equal(
    history.filter((event) => event.event_type === "APPLICATION_RESUMED")
      .length,
    4,
  );
  assert.ok(
    history
      .filter((event) =>
        [
          "RETURNED_FOR_CLARIFICATION",
          "APPLICATION_RESUMED",
          "REJECTED",
        ].includes(event.event_type),
      )
      .every((event) => event.reason),
  );
});

test("authorization, stage skipping, input tampering and stale/concurrent writes are rejected atomically", async () => {
  const id = await fixture();
  const baseline = await events(id);
  for (const role of [
    "FIELD_OFFICER",
    "CASEWORKER",
    "APPROVING_OFFICER",
  ] as Role[])
    assert.ok((await act(id, role, "ADVANCE", {})).error);
  assert.ok((await act(id, "OPERATOR", "APPROVE", { confirmed: true })).error);
  assert.ok(
    (
      await act(id, "OPERATOR", "SAVE", {
        caseworker_notes: "Forged stage data",
      })
    ).error,
  );
  assert.ok(
    (
      await act(id, "OPERATOR", "SAVE", {
        ...(await screen(id)),
        field_officer_id: officers.get("CASEWORKER"),
      })
    ).error,
  );
  const bad = await screen(id);
  bad.checklist[0].status = "MISSING";
  assert.ok((await act(id, "OPERATOR", "ADVANCE", bad)).error);
  assert.equal((await state(id)).version, 0);
  assert.equal((await state(id)).screening_notes, "");
  assert.equal(
    (await events(id)).length,
    baseline.length,
    "Rejected actions cannot leave checklist or audit changes",
  );
  const attempts = await Promise.all([
    act(id, "OPERATOR", "SAVE", await screen(id), 0),
    act(id, "OPERATOR", "SAVE", await screen(id), 0),
  ]);
  assert.equal(attempts.filter((result) => !result.error).length, 1);
  assert.equal((await state(id)).version, 1);
  const original = (await state(id)).operator_id;
  await admin
    .from("application_workflow")
    .update({ operator_id: null })
    .eq("application_id", id);
  assert.ok(
    (await act(id, "OPERATOR", "SAVE", await screen(id))).error,
    "Correct role without assignment cannot mutate",
  );
  await admin
    .from("application_workflow")
    .update({ operator_id: original })
    .eq("application_id", id);
  const profile = await admin
    .from("profiles")
    .select("taluk")
    .eq("id", officers.get("OPERATOR")!)
    .single();
  try {
    await admin
      .from("profiles")
      .update({ taluk: "Unrelated jurisdiction" })
      .eq("id", officers.get("OPERATOR")!);
    assert.ok((await act(id, "OPERATOR", "SAVE", {})).error);
  } finally {
    await admin
      .from("profiles")
      .update({ taluk: profile.data!.taluk })
      .eq("id", officers.get("OPERATOR")!);
  }
  assert.equal(
    (await act(id, "OPERATOR", "ADVANCE", await screen(id))).error,
    null,
  );
  assert.ok(
    (
      await act(id, "FIELD_OFFICER", "ADVANCE", {
        ...field(),
        visit_date: "2099-12-31",
      })
    ).error,
  );
  assert.ok(
    (await act(id, "CASEWORKER", "ADVANCE", review())).error,
    "Caseworker cannot skip field submission",
  );
});

test("manual rejection completes a fully reviewed case with a reason and timestamp", async () => {
  const id = await fixture();
  await advanceToDecision(id);
  assert.equal(
    (
      await act(id, "APPROVING_OFFICER", "REJECT", {
        confirmed: true,
        reason: "Recorded income evidence is inconsistent.",
      })
    ).error,
    null,
  );
  const work = await state(id);
  assert.ok(work.decided_at);
  assert.match(work.decision_reason!, /inconsistent/);
  assert.ok(
    (await act(id, "APPROVING_OFFICER", "APPROVE", { confirmed: true })).error,
  );
});

test("nested clarification returns unwind in order without skipping any responsible stage", async () => {
  const id = await fixture();
  await advanceToDecision(id);
  assert.equal(
    (
      await act(id, "APPROVING_OFFICER", "RETURN", {
        reason: "Please revisit the final review conclusion.",
        confirmed: true,
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await act(id, "CASEWORKER", "RETURN", {
        reason: "Clarify the field observations in the report.",
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await act(id, "FIELD_OFFICER", "RETURN", {
        reason: "Correct the income declaration document.",
      })
    ).error,
    null,
  );
  assert.equal(((await state(id)).return_stack as unknown[]).length, 2);
  assert.equal(
    (
      await act(id, "OPERATOR", "RESUME", {
        ...(await screen(id)),
        reason: "Corrected declaration received and screened.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).resume_status, "UNDER_REVIEW");
  assert.equal(
    (
      await act(id, "FIELD_OFFICER", "RESUME", {
        ...field(),
        reason: "Corrected declaration verified in the field.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).resume_status, "PENDING_APPROVAL");
  assert.equal(
    (
      await act(id, "CASEWORKER", "RESUME", {
        ...review(),
        reason: "The revised field report has been reviewed.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).clarification_pending, false);
  assert.equal(
    (await act(id, "APPROVING_OFFICER", "APPROVE", { confirmed: true })).error,
    null,
  );
});

test("legacy cases without prior sign-offs return to screening and complete the full manual chain", async () => {
  const id = await fixture();
  assert.equal(
    (
      await admin
        .from("applications")
        .update({ status: "PENDING_APPROVAL" })
        .eq("id", id)
    ).error,
    null,
  );
  assert.ok(
    (await act(id, "APPROVING_OFFICER", "APPROVE", { confirmed: true })).error,
  );
  assert.equal(
    (
      await act(id, "APPROVING_OFFICER", "RETURN", {
        reason: "Earlier manual screening and field sign-offs are missing.",
        confirmed: true,
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).resume_status, "FIELD_VERIFICATION");
  assert.equal(
    (
      await act(id, "OPERATOR", "RESUME", {
        ...(await screen(id)),
        reason: "Manual screening and assignments completed.",
      })
    ).error,
    null,
  );
  assert.equal(
    (await act(id, "FIELD_OFFICER", "ADVANCE", field())).error,
    null,
  );
  assert.equal((await act(id, "CASEWORKER", "ADVANCE", review())).error, null);
  assert.equal(
    (await act(id, "APPROVING_OFFICER", "APPROVE", { confirmed: true })).error,
    null,
  );
});

test("verification questions, review issues, explicit return destinations and before/after history persist atomically", async () => {
  const id = await fixture();
  assert.ok(
    (await act(id, "OPERATOR", "SAVE", { verification_status: "VERIFIED" }))
      .error,
    "Stage-specific fields cannot be injected by another role",
  );
  assert.equal(
    (await act(id, "OPERATOR", "ADVANCE", await screen(id))).error,
    null,
  );
  const payload = {
    ...field(),
    verification_status: "NEEDS_CLARIFICATION",
    follow_up_questions: "Explain the additional seasonal income.",
    follow_up_resolved: false,
  };
  const version = (await state(id)).version,
    requestId = randomUUID();
  assert.equal(
    (await act(id, "FIELD_OFFICER", "SAVE", payload, version, requestId)).error,
    null,
  );
  assert.equal(
    (await state(id)).follow_up_questions,
    payload.follow_up_questions,
  );
  const retry = await act(
    id,
    "FIELD_OFFICER",
    "SAVE",
    { ...payload, follow_up_questions: "Different question" },
    version,
    requestId,
  );
  assert.equal(retry.error?.message, "WORKFLOW_REQUEST_REUSED");
  const before = (await events(id)).length;
  assert.equal(
    (
      await act(id, "FIELD_OFFICER", "ADVANCE", {
        ...payload,
        verification_status: "VERIFIED",
      })
    ).error?.message,
    "WORKFLOW_FIELD_UNRESOLVED",
  );
  assert.equal((await events(id)).length, before);
  assert.equal(
    (
      await act(id, "FIELD_OFFICER", "RETURN", {
        ...payload,
        reason: "Please clarify the seasonal income document.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).return_to_stage, "SUBMITTED");
  assert.equal(
    (
      await act(id, "OPERATOR", "RESUME", {
        ...(await screen(id)),
        reason: "Revised declaration received from the fictional applicant.",
      })
    ).error,
    null,
  );
  assert.equal((await state(id)).return_to_stage, null);
  assert.equal(
    (
      await act(id, "FIELD_OFFICER", "ADVANCE", {
        ...field(),
        follow_up_questions: payload.follow_up_questions,
        follow_up_resolved: true,
      })
    ).error,
    null,
  );
  const issue = {
    ...review(),
    review_issues: "Reconcile the seasonal income calculation.",
    review_issues_resolved: false,
  };
  assert.equal((await act(id, "CASEWORKER", "SAVE", issue)).error, null);
  assert.equal((await state(id)).review_issues, issue.review_issues);
  assert.equal(
    (await act(id, "CASEWORKER", "ADVANCE", issue)).error?.message,
    "WORKFLOW_REVIEW_UNRESOLVED",
  );
  assert.equal(
    (
      await act(id, "CASEWORKER", "ADVANCE", {
        ...issue,
        review_issues_resolved: true,
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await act(id, "APPROVING_OFFICER", "APPROVE", {
        confirmed: true,
        reason: "Human decision after resolving the recorded issues.",
      })
    ).error,
    null,
  );
  const history = await events(id);
  for (const event of history) {
    assert.ok(
      Object.hasOwn(event.previous_state as object, "stage"),
      event.event_type,
    );
    assert.ok(
      Object.hasOwn(event.new_state as object, "stage"),
      event.event_type,
    );
    assert.ok(event.actor_name && event.actor_role && event.created_at);
  }
  assert.ok(
    history.some(
      (event) =>
        event.event_type === "FIELD_DRAFT_SAVED" &&
        (event.new_state as { follow_up_questions?: string })
          .follow_up_questions === payload.follow_up_questions,
    ),
  );
  assert.ok(
    history.some(
      (event) =>
        event.event_type === "CASEWORKER_REVIEW_SAVED" &&
        event.reason === issue.caseworker_notes,
    ),
  );
  assert.ok(
    history.every(
      (event, index) =>
        index === 0 || event.sequence > history[index - 1].sequence,
    ),
  );
  assert.ok(
    (await act(id, "APPROVING_OFFICER", "REOPEN", { confirmed: true })).error,
    "No implicit exceptional reopening is available",
  );
});
