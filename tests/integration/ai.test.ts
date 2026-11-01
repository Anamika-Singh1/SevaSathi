import { test, before } from "node:test";
import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const first = "10000000-0000-4000-8000-000000000001";
let cookie = "";
function decode(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
before(async () => {
  assert.equal(
    process.env.SEVASATHI_TEST_DEMO_PROJECT,
    "true",
    "Use the disposable local demo project.",
  );
  const login = await fetch(`${base}/login`);
  const html = await login.text();
  const body = new FormData();
  for (const tag of html.matchAll(/<input\b[^>]*>/gi)) {
    const attributes = Object.fromEntries(
      [...tag[0].matchAll(/([^\s=]+)="([^"]*)"/g)].map((match) => [
        match[1],
        decode(match[2]),
      ]),
    );
    if (attributes.type === "hidden" && attributes.name)
      body.set(attributes.name, attributes.value ?? "");
  }
  body.set("email", "operator@sevasathi.example.com");
  body.set("password", process.env.DEMO_OPERATOR_PASSWORD!);
  const result = await fetch(`${base}/login`, {
    method: "POST",
    body,
    redirect: "manual",
    headers: { origin: base },
  });
  assert.ok([303, 307].includes(result.status));
  cookie = result.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie);
});
async function post(
  feature: string,
  body: unknown = { version: 0 },
  options: { cookie?: string; origin?: string; id?: string } = {},
) {
  return fetch(
    `${base}/api/applications/${options.id ?? first}/ai/${feature}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: options.cookie ?? cookie,
        ...(options.origin ? { origin: options.origin } : {}),
      },
      body: JSON.stringify(body),
      redirect: "manual",
    },
  );
}
test("AI routes return JSON authentication errors without redirects and reject role or state-change attempts", async () => {
  const unauth = await post("screening", { version: 0 }, { cookie: "" });
  assert.equal(unauth.status, 401);
  assert.equal((await unauth.json()).error.code, "AI_UNAUTHENTICATED");
  assert.equal((await post("decision")).status, 403);
  assert.equal(
    (await post("screening", { version: 0, action: "APPROVE" })).status,
    400,
  );
  assert.equal(
    (await post("screening", { version: 0, role: "APPROVING_OFFICER" })).status,
    400,
  );
  assert.equal(
    (await post("screening", { version: 0, application: { annual_income: 1 } }))
      .status,
    400,
  );
  assert.equal(
    (await post("screening", { version: 0, humanAction: "APPROVE" })).status,
    400,
  );
  assert.equal(
    (
      await post(
        "screening",
        { version: 0 },
        { origin: "https://external.example" },
      )
    ).status,
    403,
  );
  assert.equal((await post("execute-approval")).status, 400);
  assert.equal(
    (await post("screening", { version: 0 }, { id: "not-a-uuid" })).status,
    400,
  );
});
test("AI routes reject stale requests, enforce methods, and honestly report missing configuration", async () => {
  assert.equal((await post("screening", { version: 2147483647 })).status, 409);
  const get = await fetch(`${base}/api/applications/${first}/ai/screening`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(get.status, 405);
  if (!process.env.GEMINI_API_KEY?.trim()) {
    const result = await post("screening", { version: 0 }, { origin: base });
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("location"), null);
    assert.match(result.headers.get("cache-control")!, /no-store/);
    const data = await result.json();
    assert.equal(data.error.code, "AI_NOT_CONFIGURED");
    assert.match(data.error.message, /GEMINI_API_KEY/);
    assert.equal(data.suggestions, undefined);
  }
});

test("reading translation requires authenticated access and rejects browser text or workflow commands", async () => {
  const endpoint = `${base}/api/applications/${first}/translation`;
  const call = (body: unknown, auth = cookie, origin = base) => fetch(endpoint, {
    method: "POST", headers: { "content-type": "application/json", cookie: auth, origin },
    body: JSON.stringify(body), redirect: "manual",
  });
  const input = { version: 0, language: "kn", field: "applicant_name" };
  assert.equal((await call(input, "")).status, 401);
  for (const body of [{ ...input, text: "Browser-supplied source" }, { ...input, action: "APPROVE" }, { ...input, language: "fr" }])
    assert.equal((await call(body)).status, 400);
  assert.equal((await call(input, cookie, "https://external.example")).status, 403);
  assert.equal((await call({ ...input, version: 2147483647 })).status, 409);
  assert.equal((await fetch(endpoint, { headers: { cookie }, redirect: "manual" })).status, 405);
  if (!process.env.GEMINI_API_KEY?.trim()) {
    const response = await call(input);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "AI_NOT_CONFIGURED");
    const closed = await fetch(`${base}/api/applications/10000000-0000-4000-8000-000000000011/translation`, {
      method: "POST", headers: { "content-type": "application/json", cookie, origin: base }, body: JSON.stringify(input),
    });
    assert.equal(closed.status, 503, "A reading-only capability must not require the final-decision role on closed cases");
    assert.equal((await closed.json()).error.code, "AI_NOT_CONFIGURED");
  }
});
