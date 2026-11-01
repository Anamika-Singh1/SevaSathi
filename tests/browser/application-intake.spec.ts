import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO_USERS } from "../../scripts/demo-users";
import { createTranslator, type Language } from "../../lib/i18n";
import type { Role } from "../../lib/roles";
import type { Database } from "../../types/database";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

function requireLocalDemo() {
  expect(
    process.env.SEVASATHI_TEST_DEMO_PROJECT,
    "Intake browser tests require an explicitly opted-in disposable local project.",
  ).toBe("true");
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  expect(["127.0.0.1", "localhost"], "Never run administrator cleanup against a hosted database.").toContain(url.hostname);
  expect(["http:", "https:"]).toContain(url.protocol);
  expect(["127.0.0.1", "localhost"], "The tested application must also be local.").toContain(new URL(base).hostname);
  return url.toString();
}

async function login(page: Page, role: Role) {
  const person = DEMO_USERS.find((user) => user.role === role)!;
  await page.context().addCookies([{ name: "sevasathi_language", value: "en", url: base }]);
  await page.goto("/login");
  await page.locator('[name="email"]').fill(person.email);
  await page.locator('[name="password"]').fill(process.env[person.passwordEnv]!);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function language(page: Page, locale: Language) {
  const selector = page.getByTestId("language-switcher").first().locator("select");
  await selector.selectOption(locale);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(selector).toBeEnabled();
}

async function fit(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `No intake overflow at ${page.viewportSize()?.width}px`,
  ).toBe(true);
  const invalidControls = await page
    .getByTestId("application-create-form")
    .locator("input:not([type=checkbox]),textarea,select,button")
    .evaluateAll((elements) => elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const style = getComputedStyle(element);
      return rect.height < 44 || (style.overflowY === "hidden" && element.scrollHeight > element.clientHeight + 2);
    }).map((element) => element.getAttribute("name") ?? element.textContent?.trim()));
  expect(invalidControls, "Intake controls have usable touch heights and uncut labels").toEqual([]);
}

test("application intake denies anonymous and field-officer entry, including direct URLs", async ({ browser }) => {
  requireLocalDemo();
  const anonymous = await browser.newContext({ baseURL: base });
  try {
    const response = await anonymous.request.get("/applications/new", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location, base).pathname).toBe("/login");
  } finally {
    await anonymous.close();
  }

  const field = await browser.newContext({ baseURL: base, viewport: { width: 360, height: 900 } });
  try {
    const page = await field.newPage();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.name));
    await login(page, "FIELD_OFFICER");
    for (const path of ["/dashboard", "/applications"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Add application", exact: true })).toHaveCount(0);
    }
    await page.goto("/applications/new");
    await expect(page).toHaveURL(/\/dashboard\?notice=forbidden$/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Your role does not have access");
    await expect(page.getByTestId("application-create-form")).toHaveCount(0);
    expect(browserErrors, "Denied intake navigation has no unhandled browser errors").toEqual([]);
  } finally {
    await field.close();
  }
});

test("operator intake fits Kannada and English screens, retries a lost response once and begins manual screening", async ({ browser }) => {
  test.setTimeout(180000);
  const url = requireLocalDemo();
  expect(process.env.SUPABASE_SECRET_KEY, "A local administrator key is required for fixture verification and cleanup.").toBeTruthy();
  const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const operator = await admin.from("profiles").select("id,district,taluk").eq("role", "OPERATOR").eq("is_active", true).single();
  expect(operator.error).toBeNull();

  const applicantName = `ಮಾದರಿ browser intake ${randomUUID()}`;
  const purpose = "Temporary fictional browser intake and safe-retry verification";
  const context = await browser.newContext({ baseURL: base, viewport: { width: 360, height: 900 } });
  try {
    const page = await context.newPage();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.name));
    await login(page, "OPERATOR");
    for (const locale of ["kn", "en"] as const) {
      await language(page, locale);
      const t = createTranslator(locale);
      for (const path of ["/dashboard", "/applications"]) {
        await page.goto(path);
        await expect(page.getByRole("main").getByRole("link", { name: t("Add application"), exact: true })).toBeVisible();
      }
      for (const width of [360, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/settings");
        const addApplication = page.getByRole("banner").getByRole("link", { name: t("Add application"), exact: true });
        await expect(addApplication).toBeVisible();
        await fit(page);
        await addApplication.click();
        await expect(page).toHaveURL(/\/applications\/new$/);
        await expect(page.getByTestId("application-create-form")).toBeVisible();
      }
      for (const width of [360, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/applications/new");
        await expect(page.getByRole("heading", { level: 1, name: t("Add application"), exact: true })).toBeVisible();
        const form = page.getByTestId("application-create-form");
        await expect(form.getByRole("textbox", { name: t("Applicant name"), exact: true })).toBeVisible();
        await expect(form.getByRole("textbox", { name: t("Village"), exact: true })).toBeVisible();
        await expect(form.getByRole("spinbutton", { name: t("Annual income (₹)"), exact: true })).toBeVisible();
        await expect(form.getByRole("textbox", { name: t("Purpose"), exact: true })).toBeVisible();
        await expect(form.getByRole("combobox", { name: t("Certificate type"), exact: true })).toHaveValue("INCOME");
        await expect(form.locator('[name="application_date"]')).toBeVisible();
        await expect(form.getByRole("checkbox")).toHaveCount(3);
        await expect(form.getByRole("textbox", { name: t("Notes (optional)"), exact: true })).toBeVisible();
        await expect(form.getByRole("button", { name: t("Create application"), exact: true })).toBeVisible();
        await expect(form.locator('[name="district"],[name="taluk"],[name="status"],[name="role"]')).toHaveCount(0);
        await fit(page);
      }
    }

    await page.setViewportSize({ width: 360, height: 900 });
    const form = page.getByTestId("application-create-form");
    await form.getByRole("button", { name: "Create application", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Review the entries highlighted below.");
    await expect(form.locator('[name="applicant_name"]')).toBeFocused();
    await form.locator('[name="applicant_name"]').fill(applicantName);
    await form.locator('[name="village"]').fill("Fictional intake browser village");
    await form.locator('[name="annual_income"]').fill("48000.50");
    await form.locator('[name="purpose"]').fill(purpose);
    await form.locator('[name="notes"]').fill("Fictional intake note saved atomically.");
    await form.locator('[name="documents"][value="identity_proof"]').check();
    await form.locator('[name="documents"][value="residence_proof"]').check();

    let intercepted = false;
    await page.route("**/applications/new", async (route) => {
      if (!intercepted && route.request().method() === "POST" && route.request().headers()["next-action"]) {
        intercepted = true;
        await route.fetch();
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });
    await form.getByRole("button", { name: "Create application", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Your entries are retained. Retry safely.");
    expect(intercepted).toBe(true);
    await expect(form.locator('[name="applicant_name"]')).toHaveValue(applicantName);
    await expect(form.locator('[name="annual_income"]')).toHaveValue("48000.50");

    const created = await admin.from("applications").select("*").eq("applicant_name", applicantName).eq("purpose", purpose);
    expect(created.error).toBeNull();
    expect(created.data).toHaveLength(1);
    const application = created.data![0];
    expect(application.status).toBe("SUBMITTED");
    expect(application.workflow_stage).toBe("DOCUMENT_SCREENING");
    expect(application.processing_status).toBe("PENDING");
    expect(application.application_date).toBeTruthy();
    expect(application.district).toBe(operator.data!.district);
    expect(application.taluk).toBe(operator.data!.taluk);
    expect(application.created_by).toBe(operator.data!.id);
    expect(application.annual_income).toBe(48000.5);
    expect(application.is_demo).toBe(false);
    expect(application.reference_number).toMatch(/^SS-\d{4}-\d{4,8}$/);

    const workflow = await admin.from("application_workflow").select("*").eq("application_id", application.id).single();
    expect(workflow.error).toBeNull();
    expect(workflow.data!.version).toBe(0);
    expect(workflow.data!.operator_id).toBe(operator.data!.id);
    const checklist = await admin.from("application_checklist").select("key,receipt_status").eq("application_id", application.id);
    expect(checklist.error).toBeNull();
    expect(checklist.data).toHaveLength(3);
    expect(checklist.data!.find((item) => item.key === "income_declaration")!.receipt_status).toBe("MISSING");
    expect(checklist.data!.filter((item) => item.receipt_status === "RECEIVED")).toHaveLength(2);
    const intakeNotes = await admin.from("application_notes").select("body,author_id").eq("application_id", application.id);
    expect(intakeNotes.error).toBeNull();
    expect(intakeNotes.data).toEqual([{ body: "Fictional intake note saved atomically.", author_id: operator.data!.id }]);
    const creationAudit = await admin.from("application_events").select("*").eq("application_id", application.id).eq("event_type", "APPLICATION_CREATED");
    expect(creationAudit.error).toBeNull();
    expect(creationAudit.data).toHaveLength(1);
    expect(creationAudit.data![0].actor_id).toBe(operator.data!.id);
    expect(creationAudit.data![0].actor_role).toBe("OPERATOR");
    expect(creationAudit.data![0].request_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(creationAudit.data![0].new_state).toMatchObject({ stage: "SUBMITTED", version: 0 });

    await page.unroute("**/applications/new");
    await form.getByRole("button", { name: "Create application", exact: true }).click();
    await expect(page).toHaveURL(`${base}/applications/${application.id}?created=1`);
    await expect(page.getByRole("status").filter({ hasText: "Application created. Document screening is ready." })).toBeVisible();
    await expect(page.getByTestId("workflow-panel")).toBeVisible();
    await expect(page.getByTestId("workflow-panel")).toContainText("Document screening");
    await expect(page.getByRole("main")).toContainText(application.reference_number);
    const afterRetry = await admin.from("applications").select("id").eq("applicant_name", applicantName).eq("purpose", purpose);
    expect(afterRetry.error).toBeNull();
    expect(afterRetry.data).toEqual([{ id: application.id }]);

    const notes = "Fictional application created through the intake form; manual screening remains available.";
    await page.locator('[name="screening_notes"]').fill(notes);
    await page.getByTestId("workflow-panel").getByRole("button", { name: "Save progress", exact: true }).click();
    await expect(page.getByTestId("workflow-panel")).toContainText("Saved successfully");
    const saved = await admin.from("application_workflow").select("version,screening_notes").eq("application_id", application.id).single();
    expect(saved.error).toBeNull();
    expect(saved.data).toEqual({ version: 1, screening_notes: notes });
    const finalAudit = await admin.from("application_events").select("event_type,request_id").eq("application_id", application.id);
    expect(finalAudit.error).toBeNull();
    expect(finalAudit.data!.filter((event) => event.event_type === "APPLICATION_CREATED")).toHaveLength(1);
    expect(finalAudit.data!.filter((event) => event.event_type === "SCREENING_SAVED")).toHaveLength(1);
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-screening-queue")).toContainText(application.reference_number);
    await page.goto(`/applications?q=${encodeURIComponent(application.reference_number)}`);
    await expect(page.getByRole("main")).toContainText(application.reference_number);
    expect(browserErrors, "Creation, retry and navigation have no unhandled browser errors").toEqual([]);
  } finally {
    try {
      // Match only this test's unique name and purpose; intake rows are not seed fixtures.
      const cleanup = await admin.from("applications").delete().eq("applicant_name", applicantName).eq("purpose", purpose);
      expect(cleanup.error).toBeNull();
    } finally {
      await context.close();
    }
  }
});
