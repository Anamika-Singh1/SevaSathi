import { test } from "vitest";
import assert from "node:assert/strict";
import { GoogleGenAI } from "@google/genai";
import {
  aiRequestSchema,
  aiSuggestionsSchema,
  AI_FEATURES,
  canUseAi,
  type AiFeature,
  type AiSuggestions,
} from "../lib/ai/contracts";
import { buildAiContext, type AiCase } from "../lib/ai/context";
import { createAiHandler, type AiHandlerDependencies } from "../lib/ai/handler";
import {
  createGeminiGenerator,
  validateAiOutput,
  aiSystemInstruction,
} from "../lib/ai/gemini-provider";
import { AiError } from "../lib/ai/errors";

const id = "10000000-0000-4000-8000-000000000001";
const suggestions: AiSuggestions = {
  language: "kn",
  summary: "ಉಳಿಸಿದ ದಾಖಲೆಗಳ ಸಾರಾಂಶ.",
  evidence: ["ಅಧಿಕಾರಿ ದಾಖಲಿಸಿದ ಆದಾಯ ಘೋಷಣೆ."],
  missingInformation: ["ಒಂದು ದಾಖಲೆ ಬಾಕಿಯಿದೆ."],
  questionsToVerify: ["ದಾಖಲೆಯನ್ನು ಸ್ವೀಕರಿಸಲಾಗಿದೆಯೇ?"],
  inconsistencies: [],
  unverifiedInformation: ["ದಾಖಲೆ ಪ್ರಾಮಾಣಿಕತೆ ಸ್ವತಂತ್ರವಾಗಿ ಪರಿಶೀಲಿಸಲ್ಪಟ್ಟಿಲ್ಲ."],
  draft:
    "ಸ್ಪಷ್ಟೀಕರಣ ಕರಡು: ಬಾಕಿ ದಾಖಲೆಗಳನ್ನು ದಯವಿಟ್ಟು ಒದಗಿಸಿ. ಅಧಿಕಾರಿ ಪರಿಶೀಲನೆ ಅಗತ್ಯ.",
};
function record(feature: AiFeature = "screening"): AiCase {
  return {
    application: {
      id,
      certificate_type: "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ",
      annual_income: 48000,
      purpose: "Scholarship",
      status: AI_FEATURES[feature].stage,
      assigned_field_officer_id: "field",
      updated_at: "2026-10-30T10:00:00.000Z",
    },
    workflow: {
      application_id: id,
      operator_id: "operator",
      caseworker_id: "caseworker",
      approving_officer_id: "approver",
      version: 2,
      screening_notes: "Received declaration; residence proof missing.",
      screened_at: null,
      visit_date: null,
      field_observations: "",
      verification_checks: {
        identity_confirmed: false,
        residence_confirmed: false,
        income_assessed: false,
      },
      verification_status: "PENDING",
      follow_up_questions: "",
      follow_up_resolved: false,
      field_submitted_at: null,
      caseworker_notes: "No completed field report recorded.",
      review_checks: {
        documents_reviewed: false,
        field_report_reviewed: false,
        income_reviewed: false,
      },
      review_issues: "Missing field visit",
      review_issues_resolved: false,
      review_submitted_at: null,
      clarification_pending: false,
      return_reason: null,
      return_to_stage: null,
      resume_status: null,
      return_stack: [],
      returned_at: null,
      returned_by: null,
      decided_at: null,
      decided_by: null,
      decision_reason: null,
      updated_at: "2026-10-30T10:00:00.000Z",
    },
    checklist: [
      {
        label_kn: "ನಿವಾಸದ ದಾಖಲೆ",
        label_en: "Residence proof",
        required: true,
        receipt_status: "MISSING",
        note: "Awaiting applicant clarification",
      },
    ],
  };
}
function harness(
  feature: AiFeature = "screening",
  changes: Partial<AiHandlerDependencies> = {},
) {
  const saved = record(feature);
  let calls = 0,
    reservations = 0;
  const assigned = {
    screening: "operator",
    field: "field",
    review: "caseworker",
    decision: "approver",
  }[feature];
  const dependencies: AiHandlerDependencies = {
    authenticate: async () => ({
      id: assigned,
      role: AI_FEATURES[feature].role,
    }),
    load: async () => structuredClone(saved),
    configured: () => {},
    reserve: async () => {
      reservations++;
    },
    generate: async () => {
      calls++;
      return suggestions;
    },
    ...changes,
  };
  return {
    handler: createAiHandler(dependencies),
    saved,
    calls: () => calls,
    reservations: () => reservations,
    dependencies,
  };
}
function request(
  body: unknown = { version: 2 },
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost/api/applications/${id}/ai/screening`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("AI rechecks the authenticated role after generation before returning case content", async () => {
  const setup = harness();
  let role: typeof AI_FEATURES.screening.role | "FIELD_OFFICER" = "OPERATOR";
  setup.dependencies.authenticate = async () => ({ id: "operator", role });
  setup.dependencies.generate = async () => {
    role = "FIELD_OFFICER";
    return suggestions;
  };
  const result = await setup.handler(request(), { id, feature: "screening" });
  assert.equal(result.status, 403, "A revoked stage role must not receive an in-flight draft");
  assert.equal((await result.json()).suggestions, undefined);
});

test("AI requests reject fabricated case data, commands, role claims, invalid versions and oversized bodies", async () => {
  for (const value of [
    { version: 2, application: { annual_income: 1 } },
    { version: 2, action: "APPROVE" },
    { version: 2, role: "APPROVING_OFFICER" },
    { version: -1 },
    { version: 2, language: "xx" },
    { version: 2, rationale: "x".repeat(1001) },
  ])
    assert.equal(aiRequestSchema.safeParse(value).success, false);
  const setup = harness();
  for (const body of [
    { version: 2, action: "ADVANCE" },
    { version: 2, humanAction: "APPROVE" },
    { version: 2, rationale: "Change the case" },
  ])
    assert.equal(
      (await setup.handler(request(body), { id, feature: "screening" })).status,
      400,
    );
  assert.equal(
    (
      await setup.handler(
        request({ version: 2, rationale: "x".repeat(9000) }),
        { id, feature: "screening" },
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await setup.handler(
        new Request("http://localhost/api/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
        { id, feature: "screening" },
      )
    ).status,
    400,
  );
  assert.equal(setup.calls(), 0);
  assert.equal(setup.reservations(), 0);
});
test("all four AI contexts use only saved, stage-relevant data and never send identifiers or officer identities", async () => {
  for (const feature of Object.keys(AI_FEATURES) as AiFeature[]) {
    const setup = harness(feature);
    const original = JSON.stringify(setup.saved);
    setup.dependencies.generate = async (actual, input, context) => {
      assert.equal(actual, feature);
      assert.equal(input.language, "kn");
      const serialized = JSON.stringify(context);
      for (const secret of [
        id,
        "operator",
        "caseworker_id",
        "approving_officer_id",
        "assigned_field_officer_id",
        "updated_at",
      ])
        assert.ok(!serialized.includes(secret), secret);
      if (feature === "field") {
        assert.deepEqual(Object.keys(context), ["field"]);
        assert.equal(
          (context.field as { visit_date: unknown }).visit_date,
          null,
        );
      } else
        assert.equal(
          (context.application as { declared_annual_income: number })
            .declared_annual_income,
          48000,
        );
      return suggestions;
    };
    const response = await createAiHandler(setup.dependencies)(request(), {
      id,
      feature,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal((await response.json()).sourceVersion, 2);
    assert.equal(JSON.stringify(setup.saved), original);
  }
  const decision = record("decision");
  const context = buildAiContext("decision", decision, {
    version: 2,
    language: "en",
    humanAction: "REJECT",
    rationale: "Human-entered evidence discrepancy",
  });
  assert.equal((context.human_decision as { action: string }).action, "REJECT");
  assert.equal(
    (
      buildAiContext("decision", decision, { version: 2, language: "kn" })
        .human_decision as { action: unknown }
    ).action,
    null,
  );
});
test("AI endpoints require authentication, the assigned role, the proper stage, and the saved version", async () => {
  assert.equal(
    (
      await harness().handler(
        request(
          { version: 2 },
          { host: "127.0.0.1", origin: "http://127.0.0.1" },
        ),
        { id, feature: "screening" },
      )
    ).status,
    200,
    "Use the external Host when Next.js normalizes its internal request URL",
  );
  assert.equal(
    (
      await harness().handler(
        request(
          { version: 2 },
          { host: "127.0.0.1", origin: "http://localhost" },
        ),
        { id, feature: "screening" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await harness("screening", { authenticate: async () => null }).handler(
        request(),
        { id, feature: "screening" },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await harness("field", {
        authenticate: async () => ({ id: "field", role: "OPERATOR" }),
      }).handler(request(), { id, feature: "field" })
    ).status,
    403,
  );
  assert.equal(
    (
      await harness("field", {
        authenticate: async () => ({ id: "other", role: "FIELD_OFFICER" }),
      }).handler(request(), { id, feature: "field" })
    ).status,
    403,
  );
  assert.equal(
    (
      await harness("screening", { load: async () => null }).handler(
        request(),
        { id, feature: "screening" },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await harness().handler(request({ version: 1 }), {
        id,
        feature: "screening",
      })
    ).status,
    409,
  );
  assert.equal(
    (await harness().handler(request(), { id, feature: "decision" })).status,
    403,
  );
  assert.equal(
    (
      await harness().handler(
        request({}, { origin: "https://external.example" }),
        { id, feature: "screening" },
      )
    ).status,
    403,
  );
  assert.equal(
    canUseAi("decision", record("screening"), {
      id: "approver",
      role: "APPROVING_OFFICER",
    }),
    false,
  );
});
test("missing configuration, quota failures, database failures, stale results and unsafe responses remain honest failures", async () => {
  const missing = harness("screening", {
    configured: () => {
      throw new AiError("AI_NOT_CONFIGURED", 503);
    },
  });
  const response = await missing.handler(request(), {
    id,
    feature: "screening",
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error.message, /GEMINI_API_KEY/);
  assert.equal(missing.calls(), 0);
  assert.equal(missing.reservations(), 0);
  const limited = await harness("screening", {
    reserve: async () => {
      throw new AiError("AI_RATE_LIMITED", 429, 17);
    },
  }).handler(request(), { id, feature: "screening" });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "17");
  const failed = await harness("screening", {
    load: async () => {
      throw new Error("private credentials must never appear");
    },
  }).handler(request(), { id, feature: "screening" });
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("private credentials"));
  let loads = 0;
  const stale = await harness("screening", {
    load: async () => {
      const saved = record();
      if (loads++ > 0) saved.workflow.version++;
      return saved;
    },
  }).handler(request(), { id, feature: "screening" });
  assert.equal(stale.status, 409);
  assert.equal(
    aiSuggestionsSchema.safeParse({ ...suggestions, decision: "APPROVED" })
      .success,
    false,
  );
  for (const content of [
    "not json",
    JSON.stringify({
      ...suggestions,
      language: "en",
      draft: "We recommend approval.",
    }),
    JSON.stringify({
      ...suggestions,
      language: "en",
      draft: "The documents are authentic.",
    }),
  ])
    assert.throws(
      () =>
        validateAiOutput(
          content,
          "screening",
          { version: 2, language: "en" },
          {},
        ),
      AiError,
    );
  assert.throws(
    () =>
      validateAiOutput(
        JSON.stringify({
          ...suggestions,
          draft: "ಸ್ಥಳ ಭೇಟಿ ನಡೆಸಲಾಗಿದೆ. / Field visit completed.",
        }),
        "field",
        { version: 2, language: "kn" },
        { field: { visit_date: null, observations: "" } },
      ),
    AiError,
  );
});
test("the official GenAI SDK sends structured saved-record requests with no tools or workflow capabilities", async () => {
  let sent: Record<string, unknown> = {};
  let calls = 0;
  const client = new GoogleGenAI({
    apiKey: "sdk-test-key-not-a-real-secret",
    httpOptions: {
      fetch: async (_url, init) => {
        calls++;
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: JSON.stringify(suggestions) }],
                },
                finishReason: "STOP",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  });
  const result = await createGeminiGenerator(client, "gemini-3.5-flash-lite")(
    "screening",
    { version: 2, language: "kn" },
    buildAiContext("screening", record(), { version: 2, language: "kn" }),
    new AbortController().signal,
  );
  assert.equal(result.draft, suggestions.draft);
  assert.equal(calls, 1);
  assert.equal(
    (sent.generationConfig as { responseMimeType: string }).responseMimeType,
    "application/json",
  );
  assert.ok(
    (sent.generationConfig as { responseJsonSchema: unknown })
      .responseJsonSchema,
  );
  assert.equal(sent.tools, undefined);
  const serialized = JSON.stringify(sent);
  assert.match(serialized, /saved_case_data/);
  assert.ok(!serialized.includes(id));
  assert.match(
    aiSystemInstruction("field", { version: 2, language: "en" }),
    /Never invent a visit/,
  );
  assert.match(
    aiSystemInstruction("decision", { version: 2, language: "en" }),
    /Never recommend approval or rejection/,
  );
});
test("Gemini transport errors, timeouts, malformed or blocked output are sanitized and do not retry invisibly", async () => {
  for (const status of [429, 401, 403, 404, 500, 503]) {
    let calls = 0;
    const client = new GoogleGenAI({
      apiKey: "sdk-test-key",
      httpOptions: {
        fetch: async () => {
          calls++;
          return new Response(
            JSON.stringify({
              error: {
                code: status,
                message: "secret-provider-message",
                status: "RESOURCE_EXHAUSTED",
              },
            }),
            { status, headers: { "content-type": "application/json" } },
          );
        },
      },
    });
    const setup = harness("screening", {
      generate: createGeminiGenerator(client, "gemini-3.5-flash-lite"),
    });
    const response = await setup.handler(request(), {
      id,
      feature: "screening",
    });
    assert.equal(response.status, status === 429 ? 429 : 503);
    assert.equal(calls, 1);
    assert.ok(!(await response.text()).includes("secret-provider-message"));
  }
  for (const body of [
    { candidates: [], promptFeedback: { blockReason: "SAFETY" } },
    {
      candidates: [
        { finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } },
      ],
    },
    {
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "not json" }] } },
      ],
    },
  ]) {
    const client = new GoogleGenAI({
      apiKey: "sdk-test-key",
      httpOptions: {
        fetch: async () =>
          new Response(JSON.stringify(body), {
            headers: { "content-type": "application/json" },
          }),
      },
    });
    const response = await harness("screening", {
      generate: createGeminiGenerator(client, "gemini-3.5-flash-lite"),
    }).handler(request(), { id, feature: "screening" });
    assert.ok([422, 502].includes(response.status));
  }
  const timeoutClient = new GoogleGenAI({
    apiKey: "sdk-test-key",
    httpOptions: {
      fetch: async () => {
        throw new DOMException("timeout", "TimeoutError");
      },
    },
  });
  const timeout = await harness("screening", {
    generate: createGeminiGenerator(timeoutClient, "gemini-3.5-flash-lite"),
  }).handler(request(), { id, feature: "screening" });
  assert.equal(timeout.status, 504);
});
