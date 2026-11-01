import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { DEMO_USERS } from "../../scripts/demo-users";
import type { Role } from "../../lib/roles";

test("four officers complete a manual case and return/resume another; a lost response never duplicates a save", async ({
  browser,
}) => {
  expect(process.env.SEVASATHI_TEST_DEMO_PROJECT).toBe("true");
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const people = await admin.from("profiles").select("*").eq("is_active", true);
  expect(people.error).toBeNull();
  const ids = new Map<Role, string>(
    people.data!.map((person) => [person.role, person.id]),
  );
  const pages = new Map<Role, Page>(),
    contexts: BrowserContext[] = [],
    fixtures: string[] = [];
  const failedRequests: {
    role: Role;
    method: string;
    path: string;
    error: string | null;
  }[] = [];
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const fixture = async (n: number) => {
    const created = await admin
      .from("applications")
      .insert({
        reference_number: `SS-2096-${(Date.now() % 8000000) + n}`,
        applicant_name: `ಮಾದರಿ ಹಂತ ಮೂರು ${n}`,
        village: "Browser workflow test",
        district: "ಮೈಸೂರು",
        taluk: "ಮೈಸೂರು",
        annual_income: 60000,
        purpose: "Disposable browser workflow case",
        is_demo: true,
        created_by: ids.get("OPERATOR")!,
        submitted_at: new Date(Date.now() - 86400000).toISOString(),
      })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    fixtures.push(created.data!.id);
    return created.data!.id;
  };
  const work = async (id: string) =>
    (
      await admin
        .from("application_workflow")
        .select("*")
        .eq("application_id", id)
        .single()
    ).data!;
  const open = async (role: Role, id: string) => {
    const page = pages.get(role)!;
    await page.goto(`/applications/${id}`);
    await expect(page.getByTestId("workflow-panel")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No workflow form overflow for ${role} at 360px`,
    ).toBe(true);
    return page;
  };
  const saved = async (page: Page) => {
    await expect(
      page.getByTestId("workflow-panel").getByText(/Saved successfully/),
    ).toBeVisible();
  };
  const screen = async (page: Page) => {
    for (const key of [
      "income_declaration",
      "identity_proof",
      "residence_proof",
    ])
      await page.locator(`[name="status:${key}"]`).selectOption("RECEIVED");
    await page
      .getByRole("textbox", { name: "Screening notes" })
      .fill("ಮಾದರಿ ದಾಖಲೆಗಳನ್ನು ಕೈಯಾರೆ ಪರಿಶೀಲಿಸಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ.");
    for (const [name, role] of [
      ["field_officer_id", "FIELD_OFFICER"],
      ["caseworker_id", "CASEWORKER"],
      ["approving_officer_id", "APPROVING_OFFICER"],
    ] as const)
      await page.locator(`[name="${name}"]`).selectOption(ids.get(role)!);
  };
  const field = async (page: Page) => {
    await page.locator('[name="verification_status"]').selectOption("VERIFIED");
    await page.locator('[name="visit_date"]').fill(today);
    await page
      .locator('[name="field_observations"]')
      .fill(
        "ಸ್ಥಳ ಭೇಟಿ ನಡೆಸಲಾಗಿದೆ. ಆದಾಯ, ಗುರುತು ಮತ್ತು ನಿವಾಸದ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ.",
      );
    for (const key of [
      "identity_confirmed",
      "residence_confirmed",
      "income_assessed",
    ])
      await page.locator(`[name="${key}"]`).check();
  };
  const review = async (page: Page) => {
    await page
      .locator('[name="caseworker_notes"]')
      .fill("ಅರ್ಜಿಯ ದಾಖಲೆಗಳು ಮತ್ತು ಕ್ಷೇತ್ರ ವರದಿಯ ಸಂಪೂರ್ಣ ಪರಿಶೀಲನೆ ನಡೆಸಲಾಗಿದೆ.");
    for (const key of [
      "documents_reviewed",
      "field_report_reviewed",
      "income_reviewed",
    ])
      await page.locator(`[name="${key}"]`).check();
  };
  try {
    for (const person of DEMO_USERS) {
      const context = await browser.newContext({
        baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
        viewport: { width: 360, height: 900 },
      });
      await context.addCookies([
        {
          name: "sevasathi_language",
          value: "en",
          url: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
        },
      ]);
      contexts.push(context);
      const page = await context.newPage();
      page.on("requestfailed", (request) => {
        if (request.method() === "POST")
          failedRequests.push({
            role: person.role,
            method: request.method(),
            path: new URL(request.url()).pathname,
            error: request.failure()?.errorText ?? null,
          });
      });
      pages.set(person.role, page);
      await page.goto("/login");
      await page.locator('[name="email"]').fill(person.email);
      await page
        .locator('[name="password"]')
        .fill(process.env[person.passwordEnv]!);
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
    const first = await fixture(1),
      second = await fixture(2);
    const operator = await open("OPERATOR", first);
    await screen(operator);
    let intercepted = false;
    await operator.route(`**/applications/${first}`, async (route) => {
      if (route.request().method() === "POST" && !intercepted) {
        intercepted = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await operator.getByRole("button", { name: /Save progress/ }).click();
    await expect(
      operator.getByTestId("workflow-panel").getByRole("alert"),
    ).toContainText(/Connection failed/);
    expect((await work(first)).version).toBe(1);
    await operator.unroute(`**/applications/${first}`);
    await operator.getByRole("button", { name: /Save progress/ }).click();
    await saved(operator);
    expect((await work(first)).version).toBe(1);
    await expect(operator.locator('[name="screening_notes"]')).not.toHaveValue(
      "",
    );
    await operator.getByRole("button", { name: /Send to field/ }).click();
    await saved(operator);
    let page = await open("FIELD_OFFICER", first);
    await field(page);
    await page
      .locator('[name="follow_up_questions"]')
      .fill("Explain the seasonal income calculation.");
    const observations = await page
      .locator('[name="field_observations"]')
      .inputValue();
    await expect(page.getByTestId("draft-recovery")).toContainText(
      /Edits protected/,
    );
    await page.getByRole("link", { name: /Back to applications/ }).click();
    await expect(page).toHaveURL(/\/applications$/);
    page = await open("FIELD_OFFICER", first);
    await expect(page.locator('[name="field_observations"]')).toHaveValue(
      observations,
    );
    await expect(page.locator('[name="follow_up_questions"]')).toHaveValue(
      "Explain the seasonal income calculation.",
    );
    await expect(page.getByTestId("draft-recovery")).toContainText(
      /Unsaved draft recovered/,
    );
    expect((await work(first)).field_observations).toBe("");
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("Discard unsaved draft?");
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: /Discard draft/ }).click();
    await expect(page.locator('[name="field_observations"]')).toHaveValue(
      observations,
    );
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("Discard unsaved draft?");
      await dialog.accept();
    });
    await page.getByRole("button", { name: /Discard draft/ }).click();
    await expect(page.locator('[name="field_observations"]')).toHaveValue("");
    await expect(page.getByTestId("validation-summary")).toContainText(
      /Observations: at least 5 characters/,
    );
    await field(page);
    await page
      .locator('[name="follow_up_questions"]')
      .fill("Explain the seasonal income calculation.");
    await page.getByRole("button", { name: /Save draft/ }).click();
    await saved(page);
    await page.reload();
    await expect(page.locator('[name="field_observations"]')).not.toHaveValue(
      "",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: /Submit field report/ }).click();
    await expect(
      page.getByTestId("workflow-panel").getByRole("alert"),
    ).toContainText(/resolve all follow-up questions/);
    await page.locator('[name="follow_up_resolved"]').check();
    await page.getByRole("button", { name: /Submit field report/ }).click();
    await saved(page);
    page = await open("CASEWORKER", first);
    await review(page);
    await page
      .locator('[name="review_issues"]')
      .fill("Check how seasonal income was reconciled.");
    await page.getByRole("button", { name: /Save review/ }).click();
    await saved(page);
    await page.getByRole("button", { name: /Forward to decision/ }).click();
    await expect(
      page.getByTestId("workflow-panel").getByRole("alert"),
    ).toContainText(/Resolve the review issues/);
    await page.locator('[name="review_issues_resolved"]').check();
    await page.getByRole("button", { name: /Forward to decision/ }).click();
    await saved(page);
    page = await open("APPROVING_OFFICER", first);
    await page.getByRole("button", { name: /Reject/ }).click();
    await expect(
      page.getByTestId("workflow-panel").getByRole("alert"),
    ).toContainText(/at least 5/);
    await page
      .locator('[name="reason"]')
      .fill("ಎಲ್ಲಾ ಪರಿಶೀಲನೆಗಳು ಪೂರ್ಣಗೊಂಡಿವೆ. ಅನುಮೋದಿಸಲಾಗಿದೆ.");
    await page.getByRole("button", { name: /Approve/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: /Cancel/ }).click();
    expect((await work(first)).decided_at).toBeNull();
    await page.getByRole("button", { name: /Approve/ }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    let approvalResponseDropped = false;
    await page.route(`**/applications/${first}`, async (route) => {
      if (route.request().method() === "POST" && !approvalResponseDropped) {
        approvalResponseDropped = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Confirm/ })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      /Connection failed/,
    );
    expect((await work(first)).decided_at).toBeTruthy();
    await page.unroute(`**/applications/${first}`);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Confirm/ })
      .click();
    try {
      await expect(page.getByText(/Final decision locked/)).toBeVisible();
    } catch (error) {
      const decision = await work(first);
      throw new Error(
        `${error instanceof Error ? error.message : "Decision did not render"}\nDiagnostics: ${JSON.stringify({ failedRequests, decided: !!decision.decided_at, version: decision.version })}`,
      );
    }
    expect((await work(first)).decided_at).toBeTruthy();
    const approvals = await admin
      .from("application_events")
      .select("id", { count: "exact", head: true })
      .eq("application_id", first)
      .eq("event_type", "APPROVED");
    expect(approvals.count).toBe(1);
    await expect(
      page
        .getByRole("navigation", {
          name: "Application sections",
        })
        .getByRole("link"),
    ).toHaveCount(8);
    const missingTargets = await page.getByRole("navigation", { name: "Application sections" }).getByRole("link").evaluateAll(links =>
      links.map(link => link.getAttribute("href") ?? "").filter(href => !href.startsWith("#") || !document.getElementById(href.slice(1))));
    expect(missingTargets, "Every case section link reaches an existing section").toEqual([]);
    await expect(
      page.getByTestId("workflow-history").locator(":scope > li").first(),
    ).toHaveAttribute("data-event-type", "APPLICATION_CREATED");
    await expect(
      page.getByTestId("workflow-history").locator(":scope > li").last(),
    ).toHaveAttribute("data-event-type", "APPROVED");
    await expect(page.locator("#field-verification")).toContainText(
      "Explain the seasonal income calculation.",
    );
    await expect(page.locator("#caseworker-review")).toContainText(
      "Check how seasonal income was reconciled.",
    );
    await expect(
      page.getByTestId("workflow-history").getByText(/Application approved/),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/phase-three-approved-360.png",
      fullPage: true,
    });

    page = await open("OPERATOR", second);
    await screen(page);
    await page.getByRole("button", { name: /Send to field/ }).click();
    await saved(page);
    page = await open("FIELD_OFFICER", second);
    await page
      .locator('[name="reason"]')
      .fill("ನಿವಾಸದ ದಾಖಲೆ ಸ್ಪಷ್ಟೀಕರಣ ಅಗತ್ಯವಾಗಿದೆ.");
    await page.getByRole("button", { name: "Return for clarification", exact: true }).click();
    await saved(page);
    expect((await work(second)).clarification_pending).toBe(true);
    expect((await work(second)).return_to_stage).toBe("SUBMITTED");
    page = await open("OPERATOR", second);
    await screen(page);
    await page
      .locator('[name="reason"]')
      .fill("ಸರಿಯಾದ ನಿವಾಸ ದಾಖಲೆ ಸ್ವೀಕರಿಸಲಾಗಿದೆ.");
    await page.getByRole("button", { name: /Resume/ }).click();
    await saved(page);
    expect((await work(second)).return_to_stage).toBeNull();
    page = await open("FIELD_OFFICER", second);
    await field(page);
    await page.getByRole("button", { name: /Submit field report/ }).click();
    await saved(page);
    page = await open("CASEWORKER", second);
    await review(page);
    await page.getByRole("button", { name: /Forward to decision/ }).click();
    await saved(page);
    page = await open("APPROVING_OFFICER", second);
    await page
      .locator('[name="reason"]')
      .fill("ದಾಖಲೆಗಳಲ್ಲಿನ ಆದಾಯ ವಿವರಗಳು ಹೊಂದಿಕೆಯಾಗಿಲ್ಲ.");
    await page.getByRole("button", { name: /Reject/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Confirm/ })
      .click();
    await expect(page.getByText(/Final decision locked/)).toBeVisible();
    await expect(
      page
        .getByTestId("workflow-history")
        .getByText(/Returned for clarification/),
    ).toBeVisible();
    await expect(
      page.getByTestId("workflow-history").getByText(/Application resumed/),
    ).toBeVisible();
    await expect(
      page.getByTestId("workflow-history").getByText(/Application rejected/),
    ).toBeVisible();
  } finally {
    if (fixtures.length)
      expect(
        (await admin.from("applications").delete().in("id", fixtures)).error,
      ).toBeNull();
    await Promise.all(contexts.map((context) => context.close()));
  }
});
