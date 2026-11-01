import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { DEMO_USERS } from "../../scripts/demo-users";
import type { Role } from "../../lib/roles";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
async function language(page: Page, value: "kn" | "en") {
  await page
    .getByTestId("language-switcher")
    .first()
    .locator("select")
    .selectOption(value);
  await expect(page.locator("html")).toHaveAttribute("lang", value);
  await expect(
    page.getByTestId("language-switcher").first().locator("select"),
  ).toBeEnabled();
}
async function login(page: Page, role: Role = "OPERATOR") {
  const person = DEMO_USERS.find((user) => user.role === role)!;
  await page.goto("/login");
  await page.locator('[name="email"]').fill(person.email);
  await page
    .locator('[name="password"]')
    .fill(process.env[person.passwordEnv]!);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function fit(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `No overflow: ${page.url()}`,
  ).toBe(true);
  const failures = await page
    .locator('input:not([type="hidden"]),textarea,select')
    .evaluateAll((elements) =>
      elements
        .filter((el) => {
          const input = el as HTMLInputElement;
          return (
            !input.labels?.length &&
            !input.getAttribute("aria-label") &&
            !input.getAttribute("aria-labelledby")
          );
        })
        .map((el) => el.getAttribute("name") ?? el.id),
    );
  expect(failures, "Every form control has a programmatic label").toEqual([]);
  const clipped = await page
    .locator("button,select,h1,h2,h3")
    .evaluateAll((elements) =>
      elements
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            getComputedStyle(el).overflowY === "hidden" &&
            el.scrollHeight > el.clientHeight + 2
          );
        })
        .map((el) => el.textContent?.trim()),
    );
  expect(clipped, "Kannada headings and controls are not clipped").toEqual([]);
  const small = await page
    .locator('button,select,input:not([type="hidden"]):not([type="checkbox"])')
    .evaluateAll((elements) =>
      elements
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.height < 44;
        })
        .map((el) => el.getAttribute("name") ?? el.textContent?.trim()),
    );
  expect(
    small,
    "Buttons and text controls have at least 44px touch height",
  ).toEqual([]);
}

test("language preferences persist across refresh and new tabs; both languages fit desktop, tablet and mobile", async ({
  page,
}) => {
  test.setTimeout(240000);
  expect(process.env.SEVASATHI_TEST_DEMO_PROJECT).toBe("true");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  await page.locator('button[type="submit"]').click();
  await expect(page.locator("#email-error")).toHaveText("ಸರಿಯಾದ ಇಮೇಲ್ ನಮೂದಿಸಿ");
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  await page.route("**/login", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    )
      await route.abort("failed");
    else await route.continue();
  });
  await page
    .getByTestId("language-switcher")
    .locator("select")
    .selectOption("en");
  await expect(
    page.getByTestId("language-switcher").getByRole("alert"),
  ).toContainText("ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ");
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  await page.unroute("**/login");
  await language(page, "en");
  await expect(page.locator("#email-error")).toHaveText("Enter a valid email");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  const preference = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sevasathi_language",
  )!;
  expect(preference.value).toBe("en");
  expect(preference.sameSite).toBe("Lax");
  expect(preference.expires * 1000).toBeGreaterThan(
    Date.now() + 300 * 86400000,
  );
  const tab = await page.context().newPage();
  await tab.goto("/login");
  await expect(tab.locator("html")).toHaveAttribute("lang", "en");
  await tab.close();
  await login(page);
  for (const locale of ["kn", "en"] as const) {
    await language(page, locale);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/dashboard",
        "/applications",
        "/applications/new",
        "/applications/10000000-0000-4000-8000-000000000001",
        "/settings",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("header")).toContainText(locale === "en" ? "Demo operator" : "ಮಾದರಿ ನಿರ್ವಾಹಕರು");
        if (path.endsWith("000000000001")) {
          const content = page.locator("#main-content");
          await expect(content).toContainText(locale === "en" ? "Demo applicant 1" : "ಮಾದರಿ ಅರ್ಜಿದಾರ ಅ");
          await expect(content).toContainText(locale === "en" ? "Scholarship" : "ವಿದ್ಯಾರ್ಥಿವೇತನ");
          await expect(content.getByText(locale === "en" ? "Demo only. All details are fictional." : "ಪ್ರಾತ್ಯಕ್ಷಿಕೆಗಾಗಿ ಮಾತ್ರ. ಎಲ್ಲಾ ವಿವರಗಳು ಕಾಲ್ಪನಿಕ.", { exact: true }).last()).toBeVisible();
          if (locale === "en") {
            // The reading view deliberately retains original script alongside
            // an optional translation; check the rest of the localized page.
            const translatedPage = await content.evaluate(node => {
              const copy = node.cloneNode(true) as HTMLElement;
              copy.querySelector('[data-testid="reading-view"]')?.remove();
              return copy.textContent ?? "";
            });
            expect(translatedPage).not.toMatch(/[\u0c80-\u0cff]/);
          }
        }
        if (path === "/applications") {
          await expect(page.locator('option[value="ಮಾದರಿ ಗ್ರಾಮ ೧"]')).toHaveText(locale === "en" ? "Demo village 1" : "ಮಾದರಿ ಗ್ರಾಮ ೧");
        }
        if (path === "/applications/new") {
          await expect(page.locator("#application-district")).toHaveValue(locale === "en" ? "Mysuru" : "ಮೈಸೂರು");
          await expect(page.locator("#application-taluk")).toHaveValue(locale === "en" ? "Mysuru" : "ಮೈಸೂರು");
        }
        await fit(page);
        if (path === "/dashboard" && [360, 1440].includes(width))
          await page.screenshot({
            path: `test-results/phase-five-${locale}-${width}.png`,
            fullPage: true,
          });
      }
      if (width < 1024) {
        await page.locator("header summary").click();
        const nav = page.locator("header nav");
        await expect(nav).toBeVisible();
        await fit(page);
        await nav
          .getByRole("link", {
            name: locale === "kn" ? "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್" : "Dashboard",
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.locator("header details")).not.toHaveAttribute(
          "open",
        );
      }
    }
  }
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/applications/new");
  const originalName = "Officer-entered name / ದಾಖಲಾದ ಹೆಸರು";
  const originalNote = "Saved evidence must remain in its original wording / ಮೂಲ ಟಿಪ್ಪಣಿ";
  await page.locator('[name="applicant_name"]').fill(originalName);
  await page.locator('[name="notes"]').fill(originalNote);
  for (const locale of ["kn", "en"] as const) {
    await language(page, locale);
    await expect(page.locator('[name="applicant_name"]')).toHaveValue(originalName);
    await expect(page.locator('[name="notes"]')).toHaveValue(originalNote);
    await expect(page.locator("#application-district")).toHaveValue(locale === "en" ? "Mysuru" : "ಮೈಸೂರು");
  }
  await page.goto("/applications");
  await page.locator("#search").focus();
  const visibleFocus = await page.locator("#search").evaluate((el) => {
    const s = getComputedStyle(el);
    return s.outlineStyle !== "none" || s.boxShadow !== "none";
  });
  expect(visibleFocus).toBe(true);
  const face = await page.evaluate(() => {
    const firstFamily = getComputedStyle(document.body).fontFamily.split(
      ",",
    )[0];
    return (
      document.fonts.check(`16px ${firstFamily}`) &&
      [...document.fonts].some((font) => font.status === "loaded")
    );
  });
  expect(face, "The locally hosted Kannada font is loaded").toBe(true);
});

test("four officers complete the workflow in Kannada, including clarification, draft recovery and human confirmation", async ({
  browser,
}) => {
  test.setTimeout(240000);
  expect(process.env.SEVASATHI_TEST_DEMO_PROJECT).toBe("true");
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const profiles = await admin
    .from("profiles")
    .select("id,role")
    .eq("is_active", true);
  expect(profiles.error).toBeNull();
  const ids = new Map(
    profiles.data!.map((profile) => [profile.role, profile.id]),
  );
  const contexts: BrowserContext[] = [],
    pages = new Map<Role, Page>();
  let id: string | undefined;
  const work = async () =>
    (
      await admin
        .from("application_workflow")
        .select("*")
        .eq("application_id", id!)
        .single()
    ).data!;
  const saved = async (page: Page) => {
    await expect(
      page
        .getByTestId("workflow-panel")
        .getByRole("status")
        .filter({ hasText: "ಕ್ರಮ ಉಳಿಸಲಾಗಿದೆ" }),
    ).toBeVisible();
  };
  const open = async (role: Role) => {
    const page = pages.get(role)!;
    await page.goto(`/applications/${id}`);
    await expect(page.getByTestId("workflow-panel")).toBeVisible();
    await fit(page);
    return page;
  };
  try {
    const created = await admin
      .from("applications")
      .insert({
        reference_number: `SS-2094-${Date.now() % 8000000}`,
        applicant_name: "ಕನ್ನಡ ಕಾರ್ಯವಿಧಾನ ಪರೀಕ್ಷೆ",
        village: "ಕಾಲ್ಪನಿಕ ಪರೀಕ್ಷಾ ಗ್ರಾಮ",
        district: "ಮೈಸೂರು",
        taluk: "ಮೈಸೂರು",
        annual_income: 60000,
        purpose: "ಕಾಲ್ಪನಿಕ ಕನ್ನಡ ಕಾರ್ಯವಿಧಾನ ಪರೀಕ್ಷೆ",
        is_demo: true,
        created_by: ids.get("OPERATOR")!,
        submitted_at: new Date(Date.now() - 86400000).toISOString(),
      })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    id = created.data!.id;
    for (const person of DEMO_USERS) {
      const context = await browser.newContext({
        baseURL: base,
        viewport: { width: 360, height: 900 },
        isMobile: true,
        hasTouch: true,
      });
      contexts.push(context);
      const page = await context.newPage();
      pages.set(person.role, page);
      await login(page, person.role);
      await expect(page.locator("html")).toHaveAttribute("lang", "kn");
    }
    let page = await open("OPERATOR");
    const panel = page.getByTestId("workflow-panel");
    await expect(
      panel.getByRole("heading", { name: "ದಾಖಲೆ ಪರಿಶೀಲನೆ", exact: true }),
    ).toBeVisible();
    await expect(panel.locator('[aria-current="step"]')).toContainText(
      "ದಾಖಲೆ ಪರಿಶೀಲನೆ",
    );
    const unsaved = "ಭಾಷೆ ಬದಲಿಸಿದರೂ ಈ ಉಳಿಸದ ಟಿಪ್ಪಣಿ ಉಳಿಯಬೇಕು.";
    await page.locator('[name="screening_notes"]').fill(unsaved);
    await language(page, "en");
    await expect(page.locator('[name="screening_notes"]')).toHaveValue(unsaved);
    await expect(page.getByTestId("validation-summary")).toContainText(
      "receipt required",
    );
    await expect(page.locator("#overview")).toContainText("Income certificate");
    await expect(page.getByTestId("workflow-history")).not.toContainText(
      "ವ್ಯವಸ್ಥೆ / System",
    );
    await page
      .getByRole("link", { name: "Back to applications", exact: true })
      .click();
    page = await open("OPERATOR");
    await expect(page.locator('[name="screening_notes"]')).toHaveValue(unsaved);
    expect((await work()).version).toBe(0);
    await language(page, "kn");
    for (const key of [
      "income_declaration",
      "identity_proof",
      "residence_proof",
    ])
      await page.locator(`[name="status:${key}"]`).selectOption("RECEIVED");
    for (const [name, role] of [
      ["field_officer_id", "FIELD_OFFICER"],
      ["caseworker_id", "CASEWORKER"],
      ["approving_officer_id", "APPROVING_OFFICER"],
    ] as const)
      await page.locator(`[name="${name}"]`).selectOption(ids.get(role)!);
    await page
      .getByRole("button", { name: "ಪ್ರಗತಿ ಉಳಿಸಿ", exact: true })
      .click();
    await saved(page);
    await page
      .getByRole("button", { name: "ಕ್ಷೇತ್ರ ಪರಿಶೀಲನೆಗೆ", exact: true })
      .click();
    await saved(page);
    page = await open("FIELD_OFFICER");
    await page
      .getByRole("button", { name: "ಹಿಂತಿರುಗಿಸಿ", exact: true })
      .click();
    await expect(page.locator('[name="reason"]')).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page.getByTestId("workflow-panel").getByRole("alert"),
    ).toContainText("ಕನಿಷ್ಠ 5");
    await page
      .locator('[name="reason"]')
      .fill("ನಿವಾಸದ ದಾಖಲೆಗೆ ಹೆಚ್ಚಿನ ಸ್ಪಷ್ಟೀಕರಣ ಅಗತ್ಯ.");
    await page
      .getByRole("button", { name: "ಹಿಂತಿರುಗಿಸಿ", exact: true })
      .click();
    await saved(page);
    page = await open("OPERATOR");
    await expect(page.getByTestId("workflow-panel")).toContainText(
      "ಸ್ಪಷ್ಟೀಕರಣ ಬಾಕಿ",
    );
    await page
      .locator('[name="reason"]')
      .fill("ನಿವಾಸದ ಸ್ಪಷ್ಟೀಕರಣವನ್ನು ದಾಖಲಿಸಿ ಪರಿಶೀಲಿಸಲಾಗಿದೆ.");
    await page
      .getByRole("button", { name: "ಪುನರಾರಂಭಿಸಿ", exact: true })
      .click();
    await saved(page);
    page = await open("FIELD_OFFICER");
    await page
      .locator('[name="visit_date"]')
      .fill(new Date(Date.now() + 19800000).toISOString().slice(0, 10));
    await page.locator('[name="verification_status"]').selectOption("VERIFIED");
    await page
      .locator('[name="field_observations"]')
      .fill(
        "ಕಾಲ್ಪನಿಕ ಪರೀಕ್ಷೆಯ ಕ್ಷೇತ್ರ ಭೇಟಿಯಲ್ಲಿ ಗುರುತು, ನಿವಾಸ ಮತ್ತು ಆದಾಯ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ.",
      );
    for (const key of [
      "identity_confirmed",
      "residence_confirmed",
      "income_assessed",
    ])
      await page.locator(`[name="${key}"]`).check();
    await page.getByRole("button", { name: "ಕರಡು ಉಳಿಸಿ", exact: true }).click();
    await saved(page);
    await page.reload();
    await expect(page.getByTestId("workflow-panel")).toBeVisible();
    await expect(page.locator('[name="field_observations"]')).toBeVisible();
    await expect(page.locator('[name="field_observations"]')).not.toHaveValue(
      "",
    );
    await fit(page);
    await page.screenshot({
      path: "test-results/phase-five-field-kn-360.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "ವರದಿ ಸಲ್ಲಿಸಿ", exact: true })
      .click();
    await saved(page);
    page = await open("CASEWORKER");
    await page
      .locator('[name="caseworker_notes"]')
      .fill(
        "ದಾಖಲೆಗಳು, ಕ್ಷೇತ್ರ ವರದಿ ಮತ್ತು ಹಿಂದಿನ ಸ್ಪಷ್ಟೀಕರಣಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ.",
      );
    for (const key of [
      "documents_reviewed",
      "field_report_reviewed",
      "income_reviewed",
    ])
      await page.locator(`[name="${key}"]`).check();
    await page
      .getByRole("button", { name: "ಪರಿಶೀಲನೆ ಉಳಿಸಿ", exact: true })
      .click();
    await saved(page);
    await page
      .getByRole("button", { name: "ಅಂತಿಮ ನಿರ್ಧಾರಕ್ಕೆ", exact: true })
      .click();
    await saved(page);
    page = await open("APPROVING_OFFICER");
    await page.getByRole("button", { name: "ಅನುಮೋದಿಸಿ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toHaveText("ನಿರ್ಧಾರ ದೃಢೀಕರಣ");
    await dialog.getByRole("button", { name: "ರದ್ದು", exact: true }).click();
    expect((await work()).decided_at).toBeNull();
    await page.getByRole("button", { name: "ಅನುಮೋದಿಸಿ", exact: true }).click();
    await dialog
      .getByRole("button", { name: "ದೃಢೀಕರಿಸಿ", exact: true })
      .click();
    await expect(page.getByTestId("workflow-panel")).toContainText(
      "ಅಂತಿಮ ನಿರ್ಧಾರದ ನಂತರ ಬದಲಾವಣೆ ಸಾಧ್ಯವಿಲ್ಲ.",
    );
    const history = page.getByTestId("workflow-history");
    for (const type of [
      "APPLICATION_CREATED",
      "CHECKLIST_CHANGED",
      "SCREENING_SAVED",
      "DOCUMENT_SCREENED",
      "RETURNED_FOR_CLARIFICATION",
      "APPLICATION_RESUMED",
      "FIELD_DRAFT_SAVED",
      "FIELD_REPORT_SUBMITTED",
      "CASEWORKER_REVIEWED",
      "APPROVED",
    ])
      await expect(
        history.locator(`[data-event-type="${type}"]`).first(),
      ).toBeVisible();
    await expect(history.locator('[data-event-type="APPROVED"]')).toContainText(
      "ಅರ್ಜಿ ಅನುಮೋದಿಸಲಾಗಿದೆ",
    );
    await language(page, "en");
    await expect(history.locator('[data-event-type="APPROVED"]')).toContainText(
      "Application approved",
    );
    await expect(page.getByTestId("workflow-panel")).toContainText(
      "Final decision locked.",
    );
    await fit(page);
  } finally {
    for (const context of contexts) await context.close();
    if (id)
      expect(
        (await admin.from("applications").delete().eq("id", id)).error,
      ).toBeNull();
  }
});
