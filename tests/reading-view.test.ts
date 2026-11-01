import { test } from "vitest";
import assert from "node:assert/strict";
import { GoogleGenAI } from "@google/genai";
import { readingFields, readingRequestSchema, type ReadingSnapshot, type ReadingSource, type ReadingField } from "../lib/ai/reading-view";
import { createReadingHandler, type ReadingDependencies } from "../lib/ai/reading-handler";
import { createReadingLimiter } from "../lib/ai/reading-limiter";
import { createReadingGenerator, readingInstruction, validateReadingOutput } from "../lib/ai/reading-provider";
import { AiError } from "../lib/ai/errors";

const id = "10000000-0000-4000-8000-000000000001";
const noteId = "30000000-0000-4000-8000-000000000001";
const source: ReadingSource = {
  application: { applicant_name: "Fictional Kavya", village: "Fictional village", district: "ಮೈಸೂರು", taluk: "ಮೈಸೂರು", purpose: "Fictional application", field_report: null },
  workflow: { screening_notes: "", field_observations: "", caseworker_notes: "", follow_up_questions: "", review_issues: "", return_reason: null, decision_reason: null },
  notes: [{ id: noteId, body: " Income confirmation is pending. Recorded amount: 48000. " }],
  checklist: [{ key: "income_declaration", note: "Income proof has not been received." }],
};
function snapshot(): ReadingSnapshot {
  return { version: 2, updatedAt: "2026-11-01T09:00:00.000Z", fields: readingFields(source) };
}
function request(body: unknown = { version: 2, language: "kn", field: "applicant_name" }, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/applications/${id}/translation`, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}
function harness(overrides: Partial<ReadingDependencies> = {}) {
  let calls = 0;
  let releases = 0;
  let reservations = 0;
  const deps: ReadingDependencies = {
    authenticate: async () => ({ id: "officer" }),
    load: async () => snapshot(), configured: () => {},
    acquire: () => { reservations++; return () => { releases++; }; },
    generate: async () => { calls++; return { language: "kn", translation: "ಕಾಲ್ಪನಿಕ ಕಾವ್ಯಾ" }; },
    ...overrides,
  };
  return { deps, handle: createReadingHandler(deps), calls: () => calls, releases: () => releases, reservations: () => reservations };
}

test("reading fields preserve originals and use stable note/document keys without projecting unrelated facts", () => {
  const before = JSON.stringify(source);
  const fields = readingFields(source);
  assert.equal(fields.find(field => field.key === `note:${noteId}`)?.original, source.notes[0].body);
  assert.equal(fields.find(field => field.key === "document:income_declaration")?.type, "document");
  assert.ok(!fields.some(field => field.key === "screening_notes"));
  assert.equal(JSON.stringify(source), before);
  for (const field of fields) assert.deepEqual(Object.keys(field).sort(), field.ordinal ? ["key", "ordinal", "original", "type"] : ["key", "original", "type"]);
});

test("translation requests reject supplied text, authority claims, unsupported languages, malformed note IDs and versions", async () => {
  const h = harness();
  for (const body of [
    { version: 2, language: "kn", field: "applicant_name", text: "Forged text" },
    { version: 2, language: "kn", field: "applicant_name", action: "APPROVE" },
    { version: -1, language: "kn", field: "applicant_name" },
    { version: 2, language: "fr", field: "applicant_name" },
    { version: 2, language: "en", field: "note:invalid" },
    { version: 2, language: "kn", field: "../../secret" },
  ]) {
    assert.equal(readingRequestSchema.safeParse(body).success, false);
    assert.equal((await h.handle(request(body), id)).status, 400);
  }
  assert.equal((await h.handle(request({ version: 2, language: "kn", field: "unknown" }), id)).status, 400);
  assert.equal(h.calls(), 0);
  assert.equal(h.reservations(), 0);
});

test("reading endpoints require a live officer, RLS-visible case, same origin and saved version", async () => {
  assert.equal((await harness({ authenticate: async () => null }).handle(request(), id)).status, 401);
  assert.equal((await harness({ load: async () => null }).handle(request(), id)).status, 404);
  assert.equal((await harness().handle(request(), "bad-id")).status, 400);
  assert.equal((await harness().handle(request(undefined, { origin: "https://outside.example" }), id)).status, 403);
  assert.equal((await harness().handle(request({ version: 1, language: "en", field: "applicant_name" }), id)).status, 409);
  const tooLarge = snapshot();
  tooLarge.fields[0].original = "x".repeat(4001);
  assert.equal((await harness({ load: async () => tooLarge }).handle(request(), id)).status, 422);
});

test("translation success includes server originals and no mutation, with private response headers", async () => {
  const saved = snapshot();
  const before = JSON.stringify(saved);
  const h = harness({ load: async () => structuredClone(saved) });
  const response = await h.handle(request(), id);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private, no-store/);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.deepEqual(await response.json(), {
    ok: true, field: "applicant_name", sourceVersion: 2, original: "Fictional Kavya", language: "kn", translation: "ಕಾಲ್ಪನಿಕ ಕಾವ್ಯಾ",
  });
  assert.equal(JSON.stringify(saved), before);
  assert.equal(h.releases(), 1);
});

test("changed text and revoked access are checked again after generation, even without a version change", async () => {
  let loads = 0;
  const changed = harness({ load: async () => {
    const value = snapshot();
    if (loads++ > 0) value.fields[0].original = "Changed saved name";
    return value;
  } });
  assert.equal((await changed.handle(request(), id)).status, 409);
  assert.equal(changed.releases(), 1);
  let checks = 0;
  const revoked = harness({ authenticate: async () => ++checks === 1 ? { id: "officer" } : null });
  assert.equal((await revoked.handle(request(), id)).status, 401);
  assert.equal(revoked.releases(), 1);
});

test("missing configuration, quota limits, wrong-language output and provider errors fail without leaking source data", async () => {
  const missing = harness({ configured: () => { throw new AiError("AI_NOT_CONFIGURED", 503); } });
  assert.equal((await missing.handle(request(), id)).status, 503);
  assert.equal(missing.reservations(), 0);
  const limited = await harness({ acquire: () => { throw new AiError("AI_RATE_LIMITED", 429, 12); } }).handle(request(), id);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "12");
  const wrong = harness({ generate: async () => ({ language: "en", translation: "Wrong language" }) });
  assert.equal((await wrong.handle(request(), id)).status, 502);
  assert.equal(wrong.releases(), 1);
  const failed = harness({ generate: async () => { throw new Error("private-provider-source-and-key"); } });
  const result = await failed.handle(request(), id);
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes("private-provider-source-and-key"));
  assert.equal(failed.releases(), 1);
});

test("reading limiter bounds attempts and concurrency per officer and expires safely", () => {
  let now = 0;
  const acquire = createReadingLimiter(() => now);
  const release = acquire("officer");
  assert.throws(() => acquire("officer"), AiError);
  release();
  for (let n = 1; n < 6; n++) acquire("officer")();
  assert.throws(() => acquire("officer"), AiError);
  acquire("different-officer")();
  now = 60001;
  acquire("officer")();
});

test("official SDK translates only the selected text with no identifiers, neighboring records or tools", async () => {
  for (const language of ["kn", "en"] as const) {
    const field: ReadingField = { key: `note:${noteId}`, type: "note", original: "Income confirmation pending. Amount 48000." };
    const expected = { language, translation: language === "kn" ? "ಆದಾಯ ದೃಢೀಕರಣ ಬಾಕಿಯಿದೆ. ಮೊತ್ತ 48000." : "Income confirmation is pending. Amount 48000." };
    const client = new GoogleGenAI({ apiKey: "fictional-reading-sdk-key", httpOptions: { fetch: async (_url, init) => {
      const sent = JSON.parse(String(init?.body));
      const content = JSON.stringify(sent.contents);
      assert.ok(content.includes(field.original));
      assert.ok(!content.includes(noteId));
      assert.equal(sent.tools, undefined);
      assert.equal(sent.generationConfig.responseJsonSchema.properties.language.const, language);
      return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(expected) }] }, finishReason: "STOP" }] });
    } } });
    const result = await createReadingGenerator(client, "gemini-3.5-flash-lite")(field, language, new AbortController().signal);
    assert.deepEqual(result, expected);
  }
  assert.match(readingInstruction("kn", "applicant_name"), /Transliterate/);
  assert.match(readingInstruction("en", "note"), /UNTRUSTED DATA/);
});

test("reading output validation rejects invented numbers, extra actions, malformed JSON and wrong languages", () => {
  for (const text of ["not json", JSON.stringify({ language: "en", translation: "Amount 49000" }),
    JSON.stringify({ language: "kn", translation: "ಮೊತ್ತ 49000" }),
    JSON.stringify({ language: "kn", translation: "ಮೊತ್ತ ದಾಖಲಾಗಿದೆ" }),
    JSON.stringify({ language: "kn", translation: "ಮೊತ್ತ 48000", action: "APPROVE" }),
    JSON.stringify({ language: "en", translation: "Amount 48000" })]) {
    assert.throws(() => validateReadingOutput(text, "Amount 48000", "kn"), AiError);
  }
  assert.equal(validateReadingOutput(JSON.stringify({ language: "kn", translation: "ಮೊತ್ತ ೪೮,೦೦೦" }), "Amount 48,000", "kn").language, "kn");
});

test("reading provider sanitizes blocked responses, API failures and timeouts", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const client = new GoogleGenAI({ apiKey: "fictional-reading-sdk-key", httpOptions: { fetch: async () =>
      Response.json({ error: { code: status, message: "private-provider-diagnostic", status: "RESOURCE_EXHAUSTED" } }, { status }) } });
    await assert.rejects(() => createReadingGenerator(client, "gemini-3.5-flash-lite")(
      { key: "applicant_name", type: "applicant_name", original: "Fictional Kavya" }, "en", new AbortController().signal,
    ), error => error instanceof AiError && !error.message.includes("private-provider-diagnostic"));
  }
  const timeout = new GoogleGenAI({ apiKey: "fictional-reading-sdk-key", httpOptions: { fetch: async () => { throw new DOMException("private-timeout", "TimeoutError"); } } });
  await assert.rejects(() => createReadingGenerator(timeout, "gemini-3.5-flash-lite")(
    { key: "purpose", type: "purpose", original: "Fictional purpose" }, "en", new AbortController().signal,
  ), error => error instanceof AiError && error.code === "AI_TIMEOUT");
  for (const body of [{ candidates: [], promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }]) {
    const blocked = new GoogleGenAI({ apiKey: "fictional-reading-sdk-key", httpOptions: { fetch: async () => Response.json(body) } });
    await assert.rejects(() => createReadingGenerator(blocked, "gemini-3.5-flash-lite")(
      { key: "purpose", type: "purpose", original: "Fictional purpose" }, "en", new AbortController().signal,
    ), AiError);
  }
});
