import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO_USERS } from "../../scripts/demo-users";
import type { Database } from "../../types/database";

test("saved-text reading view preserves originals, handles errors, switches languages and never changes records", async ({ page }) => {
  expect(process.env.SEVASATHI_TEST_DEMO_PROJECT).toBe("true");
  expect(["127.0.0.1", "localhost"]).toContain(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname);
  const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const operator = await admin.from("profiles").select("id").eq("role", "OPERATOR").eq("is_active", true).single();
  expect(operator.error).toBeNull();
  const original = "Income confirmation is pending. Recorded amount: 48000.";
  const created = await admin.from("applications").insert({
    reference_number: `SS-2091-${Date.now() % 8000000}`, applicant_name: "Fictional reading case",
    village: "Fictional village", district: "ಮೈಸೂರು", taluk: "ಮೈಸೂರು", annual_income: 48000,
    purpose: "Temporary translation UI test", created_by: operator.data!.id, is_demo: true,
  }).select("id").single();
  expect(created.error).toBeNull();
  const id = created.data!.id;
  try {
    const note = await admin.from("application_notes").insert({ application_id: id, author_id: operator.data!.id, body: original }).select("id").single();
    expect(note.error).toBeNull();
    const field = `note:${note.data!.id}`;
    const snapshot = async () => JSON.stringify(await Promise.all([
      admin.from("applications").select("*").eq("id", id).single(),
      admin.from("application_workflow").select("*").eq("application_id", id).single(),
      admin.from("application_notes").select("*").eq("application_id", id).order("id"),
      admin.from("application_events").select("*").eq("application_id", id).order("sequence"),
    ]));
    const before = await snapshot();
    await page.context().addCookies([{ name: "sevasathi_language", value: "en", url: base }]);
    await page.goto("/login");
    const person = DEMO_USERS.find(user => user.role === "OPERATOR")!;
    await page.locator('[name="email"]').fill(person.email);
    await page.locator('[name="password"]').fill(process.env[person.passwordEnv]!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/applications/${id}`);
    const panel = page.getByTestId("reading-view");
    await panel.getByRole("combobox").selectOption(field);
    await expect(panel.getByTestId("reading-original")).toHaveText(original);
    if (!process.env.GEMINI_API_KEY?.trim()) {
      await panel.getByTestId("reading-generate").click();
      await expect(panel.getByRole("alert")).toContainText("GEMINI_API_KEY");
      await expect(panel.getByTestId("reading-original")).toHaveText(original);
      await expect(page.getByTestId("workflow-panel").getByRole("button", { name: "Save progress", exact: true })).toBeEnabled();
    }
    let mode: "success" | "failure" | "rate" = "success";
    await page.route(`**/api/applications/${id}/translation`, async route => {
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual(["field", "language", "version"]);
      expect(body.field).toBe(field);
      if (mode !== "success") {
        await route.fulfill({ status: mode === "rate" ? 429 : 503,
          headers: { "content-type": "application/json", ...(mode === "rate" ? { "Retry-After": "1" } : {}) },
          body: JSON.stringify({ ok: false, error: { code: mode === "rate" ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE" } }),
        });
        return;
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        ok: true, field, sourceVersion: body.version, original,
        language: body.language,
        translation: body.language === "kn" ? "ಆದಾಯ ದೃಢೀಕರಣ ಬಾಕಿಯಿದೆ. ದಾಖಲಾದ ಮೊತ್ತ: 48000." : "Income confirmation is pending. Recorded amount: 48000.",
      }) });
    });
    await panel.getByTestId("reading-generate").click();
    await expect(panel.getByTestId("reading-translation")).toHaveText(original);
    await page.getByTestId("language-switcher").first().locator("select").selectOption("kn");
    await expect(page.locator("html")).toHaveAttribute("lang", "kn");
    await expect(panel.getByTestId("reading-translation")).toHaveCount(0);
    await expect(panel.getByTestId("reading-original")).toHaveText(original);
    await panel.getByTestId("reading-generate").click();
    await expect(panel.getByTestId("reading-translation")).toContainText("ಆದಾಯ ದೃಢೀಕರಣ ಬಾಕಿಯಿದೆ");
    await expect(panel.getByTestId("reading-original")).toHaveText(original);
    mode = "failure";
    await panel.getByTestId("reading-generate").click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.getByTestId("reading-translation")).toContainText("48000");
    mode = "rate";
    await panel.getByTestId("reading-generate").click();
    await expect(panel.getByTestId("reading-generate")).toBeDisabled();
    await expect(panel.getByTestId("reading-generate")).toBeEnabled();
    expect(await snapshot()).toBe(before);
    await panel.getByRole("combobox").selectOption("applicant_name");
    await expect(panel.getByTestId("reading-translation")).toHaveCount(0);
    await expect(panel.getByTestId("reading-original")).toHaveText("Fictional reading case");
    expect(await panel.getByRole("textbox").count()).toBe(0);
  } finally {
    expect((await admin.from("applications").delete().eq("id", id)).error).toBeNull();
  }
});
