import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO_USERS } from "../../scripts/demo-users";
import type { Role } from "../../lib/roles";
import type { Database } from "../../types/database";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
async function login(page: Page, role: Role) {
  const person = DEMO_USERS.find(user => user.role === role)!;
  await page.context().addCookies([{ name: "sevasathi_language", value: "en", url: base }]);
  await page.goto("/login");
  await page.locator('[name="email"]').fill(person.email);
  await page.locator('[name="password"]').fill(process.env[person.passwordEnv]!);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("protected HTTP routes, all four role queues and security headers enforce server authorization", async ({ browser }) => {
  test.setTimeout(240000);
  expect(process.env.SEVASATHI_TEST_DEMO_PROJECT).toBe("true");
  const anonymous = await browser.newContext({ baseURL: base });
  try {
    for (const path of ["/dashboard", "/applications", "/applications/10000000-0000-4000-8000-000000000001", "/field-work", "/reviews", "/decisions", "/settings"]) {
      const response = await anonymous.request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers().location, base).pathname).toBe("/login");
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    const headers = (await anonymous.request.get("/login")).headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("form-action 'self'");
    expect(headers["x-powered-by"]).toBeUndefined();
  } finally { await anonymous.close(); }
  for (const definition of DEMO_USERS) {
    const context = await browser.newContext({ baseURL: base, viewport: { width: 360, height: 900 } });
    try {
      const page = await context.newPage(); await login(page, definition.role);
      await page.evaluate(() => localStorage.setItem("role", "APPROVING_OFFICER"));
      for (const [path, allowedRole] of [["/field-work", "FIELD_OFFICER"], ["/reviews", "CASEWORKER"], ["/decisions", "APPROVING_OFFICER"]] as const) {
        await page.goto(path);
        if (definition.role === allowedRole) {
          await expect(page).toHaveURL(`${base}${path}`);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        } else {
          await expect(page).toHaveURL(/\/dashboard\?notice=forbidden$/);
          await expect(page.getByRole("main").getByRole("alert")).toContainText("Your role does not have access");
        }
      }
      const authCookies = (await context.cookies()).filter(cookie => cookie.name.includes("auth-token"));
      expect(authCookies.length).toBeGreaterThan(0);
      for (const cookie of authCookies) { expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("Lax"); }
    } finally { await context.close(); }
  }
});

test("untrusted application and AI text stays escaped; logout clears protected drafts and cached access", async ({ page }) => {
  test.setTimeout(180000);
  expect(process.env.SEVASATHI_TEST_DEMO_PROJECT).toBe("true");
  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const operator = await admin.from("profiles").select("id").eq("role", "OPERATOR").eq("is_active", true).single();
  expect(operator.error).toBeNull();
  const payload = '<img src=x onerror="window.__sevasathi_xss=true">';
  const created = await admin.from("applications").insert({ reference_number: `SS-2093-${Date.now() % 8000000}`, applicant_name: payload, village: "Fictional security test", district: "ಮೈಸೂರು", taluk: "ಮೈಸೂರು", annual_income: 0, purpose: "Temporary XSS and sign-out test", is_demo: true, created_by: operator.data!.id }).select("id").single();
  expect(created.error).toBeNull();
  const id = created.data!.id;
  try {
    page.on("dialog", dialog => dialog.accept());
    await page.setViewportSize({ width: 360, height: 900 });
    await login(page, "OPERATOR"); await page.goto(`/applications/${id}`);
    await expect(page.getByTestId("workflow-panel")).toBeVisible();
    await expect(page.getByText(payload, { exact: false }).first()).toBeVisible();
    await page.locator('[name="screening_notes"]').fill(payload);
    await page.getByRole("button", { name: "Save progress", exact: true }).click();
    await expect(page.getByTestId("workflow-panel")).toContainText("Saved successfully");
    await expect(page.locator("#documents")).toContainText(payload);
    await page.route(`**/api/applications/${id}/ai/screening`, async route => {
      const input = route.request().postDataJSON() as { version: number; language: string };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, feature: "screening", sourceVersion: input.version, generatedAt: new Date().toISOString(), suggestions: { language: input.language, summary: payload, evidence: [], missingInformation: [], questionsToVerify: [], inconsistencies: [], unverifiedInformation: [], draft: payload } }) });
    });
    const ai = page.getByTestId("ai-assistant");
    await ai.getByRole("button", { name: "Generate Suggestions", exact: true }).click();
    await expect(ai.getByTestId("ai-suggestions")).toBeVisible();
    await expect(ai.getByRole("textbox", { name: "Editable AI draft" })).toHaveValue(payload);
    expect(await page.evaluate(() => (window as Window & { __sevasathi_xss?: boolean }).__sevasathi_xss)).toBeUndefined();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await page.locator('[name="screening_notes"]').fill("Unsaved fictional security-test note");
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("sevasathi:draft:")).length)).toBeGreaterThan(0);
    await page.locator("header summary").click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?loggedOut=1$/);
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("sevasathi:draft:")).length)).toBe(0);
    await page.goto(`/applications/${id}`); await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page.getByTestId("workflow-panel")).toHaveCount(0);
    await expect(page.getByText("Unsaved fictional security-test note", { exact: true })).toHaveCount(0);
  } finally { expect((await admin.from("applications").delete().eq("id", id)).error).toBeNull(); }
});
