import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

test("live dashboard, combined filters, pagination, details, mobile navigation and recovery", async ({
  page,
}) => {
  expect(
    process.env.SEVASATHI_TEST_DEMO_PROJECT,
    "Use a disposable demo project",
  ).toBe("true");
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const rows = await admin
    .from("application_worklist")
    .select("*")
    .order("submitted_at");
  expect(rows.error).toBeNull();
  const applications = rows.data!;
  expect(applications).toHaveLength(12);
  await page
    .context()
    .addCookies([
      {
        name: "sevasathi_language",
        value: "en",
        url: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
      },
    ]);
  await page.goto("/login");
  await page
    .locator('input[name="email"]')
    .fill("operator@sevasathi.example.com");
  await page
    .locator('input[name="password"]')
    .fill(process.env.DEMO_OPERATOR_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const [label, count] of Object.entries({
    "Total pending": applications.filter((row) => row.is_pending).length,
    "Immediate attention": applications.filter((row) => row.priority_rank === 3)
      .length,
    "Field verification pending": applications.filter(
      (row) => row.status === "FIELD_VERIFICATION",
    ).length,
    "Final review pending": applications.filter((row) =>
      ["UNDER_REVIEW", "PENDING_APPROVAL"].includes(row.status!),
    ).length,
    "Overdue applications": applications.filter((row) => row.is_overdue).length,
    "Recently processed": applications.filter((row) => row.recently_processed)
      .length,
  }))
    await expect(page.locator(`[data-metric="${label}"]`)).toHaveText(
      String(count),
    );

  await page.goto("/applications");
  await expect(page.getByTestId("result-count")).toContainText("1–10 / 12");
  await page.getByRole("link", { name: /Next/ }).click();
  await expect(page.getByTestId("result-count")).toContainText("11–12 / 12");
  await page.goto("/applications?page=9999");
  await expect(page.getByTestId("result-count")).toContainText("11–12 / 12");

  const target = applications.find(
    (row) => row.reference_number === "SS-2026-0005",
  )!;
  await page.goto("/applications");
  await page.locator("#search").fill("0005");
  await page.locator("#village").selectOption(target.village!);
  await page.locator("#status").selectOption(target.status!);
  await page.locator("#priority").selectOption(target.priority!);
  await page.locator("#overdue").selectOption(target.is_overdue ? "yes" : "no");
  await page.locator("#sort").selectOption("target");
  await page.getByRole("button", { name: /Apply/ }).click();
  await expect(page.getByTestId("result-count")).toContainText("1–1 / 1");
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "SS-2026-0005", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Clear filters/ }).click();
  await expect(page.getByTestId("result-count")).toContainText("1–10 / 12");
  await page.locator("#search").fill("ಅರ್ಜಿದಾರ ಅ");
  await page.getByRole("button", { name: /Apply/ }).click();
  await expect(page.getByTestId("result-count")).toContainText("1–1 / 1");
  await page.locator("#search").fill('"),priority_rank.gte.0');
  await page.getByRole("button", { name: /Apply/ }).click();
  await expect(page.getByText("No applications found")).toBeVisible();

  const oldest = applications
    .filter((row) => row.is_pending)
    .map((row) => row.id);
  await page.goto("/applications?view=pending&sort=oldest");
  const visibleLinks = page
    .locator('[data-testid="application-cards"] a')
    .filter({ hasText: /^SS-/ });
  await expect(visibleLinks).toHaveCount(10);
  const shown = await visibleLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")!.split("/").pop()),
  );
  expect(shown).toEqual(oldest);
  await page.goto("/applications?view=pending&sort=target");
  const byTarget = applications
    .filter((row) => row.is_pending)
    .sort(
      (a, b) =>
        a.effective_target_date!.localeCompare(b.effective_target_date!) ||
        a.id!.localeCompare(b.id!),
    );
  expect(
    await page
      .locator('[data-testid="application-cards"] a')
      .filter({ hasText: /^SS-/ })
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")!.split("/").pop()),
      ),
  ).toEqual(byTarget.map((row) => row.id));

  for (const application of applications) {
    const response = await page.goto(`/applications/${application.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      application.reference_number!,
    );
    for (const section of [
      "overview",
      "documents",
      "field-verification",
      "caseworker-review",
      "ai-assistance",
      "history",
    ])
      await expect(
        page.locator(`#${section}`).getByRole("heading").first(),
      ).toBeVisible();
  }

  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/dashboard",
      "/applications",
      `/applications/${target.id}`,
      "/settings",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `No overflow at ${width}px on ${path}`,
      ).toBe(true);
      if (path === "/dashboard" && [360, 1440].includes(width))
        await page.screenshot({
          path: `test-results/dashboard-${width}.png`,
          fullPage: true,
        });
    }
    if (width < 1024) {
      await page.locator("header summary").click();
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(nav).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await nav.getByRole("link", { name: /Dashboard/ }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
  }

  // A missing demo configuration exercises the real server error boundary.
  // Always restore it, even if an assertion fails. This suite is opt-in only.
  const settings = await admin
    .from("workflow_demo_settings")
    .select("*")
    .single();
  expect(settings.error).toBeNull();
  try {
    const removed = await admin
      .from("workflow_demo_settings")
      .delete()
      .eq("id", true);
    expect(removed.error).toBeNull();
    await page.goto("/applications");
    await expect(
      page.getByRole("heading", { name: "Unable to load data" }),
    ).toBeVisible();
  } finally {
    const restored = await admin
      .from("workflow_demo_settings")
      .upsert(settings.data!);
    expect(restored.error).toBeNull();
  }
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(
    page.getByRole("heading", { name: "Unable to load data" }),
  ).toBeHidden();
  await expect(
    page.getByTestId("result-count").filter({ visible: true }),
  ).toContainText("1–10 / 12");
  await page.goto("/applications/not-a-uuid");
  await expect(
    page.getByRole("heading", { name: /Page or application/ }),
  ).toBeVisible();
});
