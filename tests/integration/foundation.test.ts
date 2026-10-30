import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_USERS } from "../../scripts/demo-users";
import type { Database } from "../../types/database";
import { applicationSearchExpression } from "../../lib/application-filters";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const clients: SupabaseClient<Database>[] = [];
let admin: SupabaseClient<Database>;

before(async () => {
  assert.equal(
    process.env.SEVASATHI_TEST_DEMO_PROJECT,
    "true",
    "Integration tests require SEVASATHI_TEST_DEMO_PROJECT=true and a disposable seeded project.",
  );
  assert.ok(
    url && key && secret,
    "Configure Supabase environment values first.",
  );
  admin = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const definition of DEMO_USERS) {
    const password = process.env[definition.passwordEnv];
    assert.ok(password, `Missing ${definition.passwordEnv}`);
    const client: SupabaseClient<Database> = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email: definition.email,
      password,
    });
    assert.equal(
      error,
      null,
      `Demo ${definition.role} should authenticate after demo:setup`,
    );
    clients.push(client);
  }
});

after(async () => {
  await Promise.all(
    clients.map((client) => client.auth.signOut({ scope: "local" })),
  );
});

test("Phase 2 views preserve jurisdiction, assignment, and anonymous isolation", async () => {
  for (const [index, definition] of DEMO_USERS.entries()) {
    const result = await clients[index]
      .from("application_worklist")
      .select("*");
    assert.equal(result.error, null);
    assert.equal(
      result.data?.length,
      definition.role === "FIELD_OFFICER" ? 3 : 12,
    );
    const villages = await clients[index]
      .from("application_villages")
      .select("*");
    assert.equal(villages.error, null);
    assert.equal(
      villages.data?.length,
      definition.role === "FIELD_OFFICER" ? 3 : 4,
    );
  }
  const anonymous = createClient<Database>(url!, key!, {
    auth: { persistSession: false },
  });
  for (const view of [
    "application_worklist",
    "application_villages",
  ] as const) {
    const result = await anonymous.from(view).select("*");
    assert.ok(result.error || !result.data?.length);
  }
  const anonymousSettings = await anonymous
    .from("workflow_demo_settings")
    .select("*");
  assert.ok(anonymousSettings.error || !anonymousSettings.data?.length);
  assert.ok(
    (
      await clients[0]
        .from("workflow_demo_settings")
        .update({ target_days: 1 })
        .eq("id", true)
    ).error,
  );
  const visible = await clients[0].rpc("application_assigned_officer", {
    target_id: "10000000-0000-4000-8000-000000000004",
  });
  assert.equal(visible.error, null);
  assert.equal(visible.data?.length, 1);
  assert.ok(visible.data?.[0].full_name);
  const hidden = await clients[1].rpc("application_assigned_officer", {
    target_id: "10000000-0000-4000-8000-000000000001",
  });
  assert.equal(hidden.error, null);
  assert.deepEqual(hidden.data, []);
});

test("Phase 2 search handles partial references, Kannada, UUIDs, wildcards and grammar safely", async () => {
  for (const term of [
    "0001",
    "ಅರ್ಜಿದಾರ ಅ",
    "10000000-0000-4000-8000-000000000001",
  ]) {
    const result = await clients[0]
      .from("application_worklist")
      .select("id")
      .or(applicationSearchExpression(term));
    assert.equal(result.error, null, `search ${term}`);
    assert.equal(result.data?.length, 1);
  }
  for (const term of [
    "%",
    "_",
    "*",
    '"),priority_rank.gte.0,applicant_name.ilike.("',
    "comma,(quote)\\",
  ]) {
    const result = await clients[0]
      .from("application_worklist")
      .select("id")
      .or(applicationSearchExpression(term));
    assert.equal(result.error, null, `literal search ${term}`);
    assert.deepEqual(result.data, []);
  }
});

test("Phase 2 priorities honor target boundaries, stage age, unresolved actions, and completion", async () => {
  const config = await admin
    .from("workflow_demo_settings")
    .select("*")
    .single();
  assert.equal(config.error, null);
  const settings = config.data!;
  const now = new Date();
  const day = 86400000;
  const localDate = (offset: number) =>
    new Date(now.getTime() + 19800000 + offset * day)
      .toISOString()
      .slice(0, 10);
  const ago = (days: number) =>
    new Date(now.getTime() - days * day).toISOString();
  const base = {
    status: "SUBMITTED" as const,
    unresolved_actions: [] as string[],
    processed_at: null as string | null,
    applicant_name: "Phase 2 fictional test",
    village: "Test village",
    district: "ಮೈಸೂರು",
    taluk: "ಮೈಸೂರು",
    annual_income: 0,
    purpose: "Disposable integration fixture",
    is_demo: true,
    submitted_at: ago(20),
    stage_entered_at: ago(0),
    target_date: localDate(30),
  };
  const cases = [
    { fields: {}, rank: 1 },
    { fields: { target_date: localDate(0) }, rank: 2 },
    { fields: { target_date: localDate(-1) }, rank: 3 },
    {
      fields: { stage_entered_at: ago(settings.stage_attention_days) },
      rank: 2,
    },
    {
      fields: { stage_entered_at: ago(settings.stage_attention_days * 2) },
      rank: 3,
    },
    { fields: { unresolved_actions: ["Missing clarification"] }, rank: 2 },
    {
      fields: {
        unresolved_actions: Array.from(
          { length: settings.urgent_action_count },
          (_, n) => `Action ${n}`,
        ),
      },
      rank: 3,
    },
    {
      fields: {
        status: "APPROVED" as const,
        target_date: localDate(-1),
        stage_entered_at: ago(10),
        processed_at: ago(1),
      },
      rank: 0,
    },
  ];
  const inserted = await admin
    .from("applications")
    .insert(
      cases.map((entry, n) => ({
        ...base,
        ...entry.fields,
        reference_number: `SS-2099-${90000000 + n}`,
      })),
    )
    .select("id,reference_number");
  assert.equal(inserted.error, null);
  const ids = inserted.data!.map((row) => row.id);
  try {
    const result = await clients[0]
      .from("application_worklist")
      .select("*")
      .in("id", ids)
      .order("reference_number");
    assert.equal(result.error, null);
    assert.equal(result.data?.length, cases.length);
    for (const [index, row] of result.data!.entries()) {
      assert.equal(
        row.priority_rank,
        cases[index].rank,
        `priority case ${index}`,
      );
      assert.ok(row.priority_reasons?.length);
    }
    assert.equal(
      result.data![1].is_overdue,
      false,
      "a target due today is not overdue",
    );
    assert.equal(result.data![2].days_overdue, 1);
    assert.equal(
      result.data![7].is_overdue,
      false,
      "closed applications cannot be overdue",
    );
    assert.equal(result.data![7].recently_processed, true);
    assert.equal(
      result.data![7].days_pending,
      19,
      "completed age stops on processing date",
    );
    const before = await admin
      .from("applications")
      .select("stage_entered_at")
      .eq("id", ids[0])
      .single();
    await admin
      .from("applications")
      .update({ purpose: "Unrelated update" })
      .eq("id", ids[0]);
    const unchanged = await admin
      .from("applications")
      .select("stage_entered_at")
      .eq("id", ids[0])
      .single();
    assert.equal(
      unchanged.data?.stage_entered_at,
      before.data?.stage_entered_at,
    );
    await admin
      .from("applications")
      .update({ status: "REJECTED" })
      .eq("id", ids[0]);
    const closed = await admin
      .from("applications")
      .select("processed_at")
      .eq("id", ids[0])
      .single();
    assert.ok(closed.data?.processed_at);
    await admin
      .from("applications")
      .update({ status: "SUBMITTED" })
      .eq("id", ids[0]);
    const reopened = await admin
      .from("applications")
      .select("processed_at")
      .eq("id", ids[0])
      .single();
    assert.equal(reopened.data?.processed_at, null);
  } finally {
    const removed = await admin.from("applications").delete().in("id", ids);
    assert.equal(removed.error, null, "temporary fixtures must be cleaned up");
  }
});

test("Auth permits email sign-in while public registration stays disabled", async () => {
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key! },
  });
  assert.equal(response.status, 200);
  const settings = (await response.json()) as {
    disable_signup: boolean;
    external: { email: boolean };
  };
  assert.equal(
    settings.external.email,
    true,
    "email/password provider must be enabled",
  );
  assert.equal(
    settings.disable_signup,
    true,
    "public registration must remain disabled",
  );
});

test("four officers authenticate and see their administrator-assigned roles", async () => {
  for (const [index, definition] of DEMO_USERS.entries()) {
    const { data, error } = await clients[index].from("profiles").select("*");
    assert.equal(error, null);
    assert.equal(data?.length, 1, "officer must not read other profiles");
    assert.equal(data?.[0].role, definition.role);
  }
});

test("12 seed applications exist; field officer sees only three assignments", async () => {
  for (const [index, definition] of DEMO_USERS.entries()) {
    const { data, error } = await clients[index]
      .from("applications")
      .select("*")
      .eq("is_demo", true);
    assert.equal(error, null);
    assert.equal(data?.length, definition.role === "FIELD_OFFICER" ? 3 : 12);
    assert.ok(data?.every((row) => row.applicant_name.startsWith("ಮಾದರಿ")));
  }
});

test("anonymous clients cannot retrieve applications or profiles", async () => {
  const anonymous = createClient<Database>(url!, key!, {
    auth: { persistSession: false },
  });
  for (const table of [
    "applications",
    "profiles",
    "application_documents",
    "application_notes",
    "application_events",
  ] as const) {
    const { data, error } = await anonymous.from(table).select("*");
    assert.ok(error || data?.length === 0);
  }
});

test("field officer cannot read another assignment or its child records", async () => {
  const hiddenId = "10000000-0000-4000-8000-000000000001";
  const application = await clients[1]
    .from("applications")
    .select("*")
    .eq("id", hiddenId);
  assert.equal(application.error, null);
  assert.deepEqual(application.data, []);
  for (const table of [
    "application_documents",
    "application_notes",
    "application_events",
  ] as const) {
    const { data, error } = await clients[1]
      .from(table)
      .select("*")
      .eq("application_id", hiddenId);
    assert.equal(error, null);
    assert.deepEqual(data, []);
  }
});

test("officers cannot self-assign roles, forge audit events, or mutate workflow data", async () => {
  const { data: profiles } = await clients[0].from("profiles").select("*");
  const id = profiles![0].id;
  assert.ok(
    (
      await clients[0]
        .from("profiles")
        .update({ role: "APPROVING_OFFICER" })
        .eq("id", id)
    ).error,
  );
  assert.ok(
    (
      await clients[0].from("profiles").insert({
        id,
        full_name: "forged",
        role: "APPROVING_OFFICER",
        district: "ಮೈಸೂರು",
        taluk: "ಮೈಸೂರು",
      })
    ).error,
  );
  assert.ok(
    (
      await clients[0]
        .from("applications")
        .update({ status: "APPROVED" })
        .eq("is_demo", true)
    ).error,
  );
  assert.ok(
    (
      await clients[0].from("application_events").insert({
        application_id: "10000000-0000-4000-8000-000000000001",
        event_type: "FORGED",
        description: "forged",
      })
    ).error,
  );
  await clients[0].auth.updateUser({ data: { role: "APPROVING_OFFICER" } });
  const { data: profile } = await clients[0]
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single();
  assert.equal(
    profile?.role,
    "OPERATOR",
    "user-controlled Auth metadata must never change roles",
  );
  // Restore only the test metadata key; role authority never leaves public.profiles.
  await clients[0].auth.updateUser({ data: { role: null } });
});

test("revoking officer access immediately hides all rows", async () => {
  const { data: profiles } = await clients[2].from("profiles").select("id");
  const id = profiles![0].id;
  try {
    assert.equal(
      (await admin.from("profiles").update({ is_active: false }).eq("id", id))
        .error,
      null,
    );
    const { data, error } = await clients[2].from("applications").select("id");
    assert.equal(error, null);
    assert.deepEqual(data, []);
  } finally {
    assert.equal(
      (await admin.from("profiles").update({ is_active: true }).eq("id", id))
        .error,
      null,
    );
  }
});

test("matching role cannot bypass taluk jurisdiction", async () => {
  const { data: profiles } = await clients[2]
    .from("profiles")
    .select("id, taluk");
  const profile = profiles![0];
  try {
    assert.equal(
      (
        await admin
          .from("profiles")
          .update({ taluk: "ಕಾಲ್ಪನಿಕ ಬೇರೆ ತಾಲ್ಲೂಕು" })
          .eq("id", profile.id)
      ).error,
      null,
    );
    const { data, error } = await clients[2].from("applications").select("id");
    assert.equal(error, null);
    assert.deepEqual(data, []);
  } finally {
    assert.equal(
      (
        await admin
          .from("profiles")
          .update({ taluk: profile.taluk })
          .eq("id", profile.id)
      ).error,
      null,
    );
  }
});

test("database rejects a non-field-officer assignment", async () => {
  const { data: profiles } = await clients[2].from("profiles").select("id");
  const result = await admin
    .from("applications")
    .update({ assigned_field_officer_id: profiles![0].id })
    .eq("id", "10000000-0000-4000-8000-000000000001");
  assert.ok(
    result.error,
    "assignment trigger must reject assigning a caseworker as a field officer",
  );
});

test("HTTP routes redirect unauthenticated requests to login", async () => {
  for (const path of [
    "/dashboard",
    "/applications",
    "/applications/10000000-0000-4000-8000-000000000001",
    "/field-work",
    "/reviews",
    "/decisions",
    "/settings",
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    assert.ok(
      [303, 307, 308].includes(response.status),
      `${path} must redirect`,
    );
    assert.equal(
      new URL(response.headers.get("location")!, baseUrl).pathname,
      "/login",
    );
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
});

test("HTML forms perform real server-side login and logout with protected HttpOnly cookies", async () => {
  const jar = new Map<string, string>();
  const cookieHeader = () =>
    Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
  function remember(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
  }
  function decode(value: string) {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  function formFrom(html: string) {
    const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/i)?.[0];
    assert.ok(form, "server-rendered form should exist");
    const data = new FormData();
    for (const input of form.matchAll(/<input\b[^>]*>/gi)) {
      const attributes = Object.fromEntries(
        Array.from(input[0].matchAll(/([^\s=]+)="([^"]*)"/g), (entry) => [
          entry[1],
          decode(entry[2]),
        ]),
      );
      if (attributes.name && attributes.type === "hidden")
        data.append(attributes.name, attributes.value ?? "");
    }
    assert.ok(
      Array.from(data.keys()).some((name) => name.startsWith("$ACTION")),
      "Next.js server action must be present",
    );
    return data;
  }
  const loginPage = await fetch(`${baseUrl}/login`);
  assert.equal(loginPage.status, 200);
  remember(loginPage);
  const loginData = formFrom(await loginPage.text());
  loginData.set("email", DEMO_USERS[0].email);
  loginData.set("password", process.env.DEMO_OPERATOR_PASSWORD!);
  const signedIn = await fetch(`${baseUrl}/login`, {
    method: "POST",
    body: loginData,
    redirect: "manual",
    headers: { origin: baseUrl, cookie: cookieHeader() },
  });
  assert.ok(
    [303, 307].includes(signedIn.status),
    "valid login should redirect",
  );
  assert.equal(
    new URL(signedIn.headers.get("location")!, baseUrl).pathname,
    "/dashboard",
  );
  const sessionCookies = signedIn.headers
    .getSetCookie()
    .filter((cookie) => /sb-.*auth-token/.test(cookie));
  assert.ok(sessionCookies.length > 0, "login must establish a session");
  for (const cookie of sessionCookies) {
    assert.ok(/HttpOnly/i.test(cookie), "session cookies must be HttpOnly");
    assert.ok(
      /SameSite=lax/i.test(cookie),
      "session cookies must use SameSite=Lax",
    );
  }
  remember(signedIn);
  const dashboard = await fetch(`${baseUrl}/dashboard`, {
    headers: { cookie: cookieHeader() },
  });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /SS-2026-/);
  assert.match(dashboard.headers.get("cache-control") ?? "", /no-store/);
  remember(dashboard);

  const forbidden = await fetch(`${baseUrl}/decisions`, {
    redirect: "manual",
    headers: { cookie: cookieHeader() },
  });
  const forbiddenBody = await forbidden.text();
  assert.ok(
    (forbidden.headers.get("location") ?? "").includes("notice=forbidden") ||
      forbiddenBody.includes("notice=forbidden"),
    "operator must be rejected by server-side role authorization",
  );
  assert.ok(!forbiddenBody.includes("Approving officer queue"));
  const settings = await fetch(`${baseUrl}/settings`, {
    headers: { cookie: cookieHeader() },
  });
  const logoutData = formFrom(await settings.text());
  const signedOut = await fetch(`${baseUrl}/settings`, {
    method: "POST",
    body: logoutData,
    redirect: "manual",
    headers: { origin: baseUrl, cookie: cookieHeader() },
  });
  assert.ok([303, 307].includes(signedOut.status));
  assert.equal(
    new URL(signedOut.headers.get("location")!, baseUrl).pathname,
    "/login",
  );
  remember(signedOut);
  const blocked = await fetch(`${baseUrl}/dashboard`, {
    redirect: "manual",
    headers: { cookie: cookieHeader() },
  });
  assert.equal(
    new URL(blocked.headers.get("location")!, baseUrl).pathname,
    "/login",
  );
});
