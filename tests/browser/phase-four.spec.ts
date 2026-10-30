import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { DEMO_USERS } from "../../scripts/demo-users";
import {
  AI_FEATURES,
  type AiFeature,
  type AiSuggestions,
} from "../../lib/ai/contracts";

// Successful generation below is an explicitly intercepted UI fixture. The
// production application has no fake-provider mode or fallback suggestions.
test("all four AI panels handle missing configuration, editable fixture drafts, language, copy and retries without changing cases", async ({
  browser,
}) => {
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
  const fieldOfficer = profiles.data!.find(
    (profile) => profile.role === "FIELD_OFFICER",
  )!.id;
  const operator = profiles.data!.find(
    (profile) => profile.role === "OPERATOR",
  )!.id;
  const fixtures: string[] = [];
  try {
    for (const [index, definition] of DEMO_USERS.entries()) {
      const feature = Object.entries(AI_FEATURES).find(
        ([, value]) => value.role === definition.role,
      )![0] as AiFeature;
      const created = await admin
        .from("applications")
        .insert({
          reference_number: `SS-2095-${(Date.now() % 8000000) + index}`,
          applicant_name: `ಮಾದರಿ AI ಪರೀಕ್ಷೆ ${index}`,
          village: "AI browser test",
          district: "ಮೈಸೂರು",
          taluk: "ಮೈಸೂರು",
          annual_income: 48000,
          purpose: "Temporary AI UI verification",
          status: AI_FEATURES[feature].stage,
          created_by: operator,
          assigned_field_officer_id: fieldOfficer,
          is_demo: true,
        })
        .select("id")
        .single();
      expect(created.error).toBeNull();
      const id = created.data!.id;
      fixtures.push(id);
      const context = await browser.newContext({
        baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
        viewport: { width: 360, height: 900 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      await context.addCookies([
        {
          name: "sevasathi_language",
          value: "en",
          url: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
        },
      ]);
      try {
        const page = await context.newPage();
        page.on("dialog", (dialog) => dialog.accept());
        await page.goto("/login");
        await page.locator('[name="email"]').fill(definition.email);
        await page
          .locator('[name="password"]')
          .fill(process.env[definition.passwordEnv]!);
        await page.locator('button[type="submit"]').click();
        await expect(page).toHaveURL(/\/dashboard$/);
        await page.goto(`/applications/${id}`);
        const panel = page.getByTestId("ai-assistant");
        await expect(
          panel.getByRole("button", { name: /Generate Suggestions/ }),
        ).toBeEnabled();
        await expect(
          panel.getByRole("combobox", { name: /Suggestion language/ }),
        ).toHaveValue("en");
        await panel
          .getByRole("combobox", { name: /Suggestion language/ })
          .selectOption("kn");
        const endpoint = `**/api/applications/${id}/ai/${feature}`;
        if (!process.env.GEMINI_API_KEY?.trim()) {
          await panel
            .getByRole("button", { name: /Generate Suggestions/ })
            .click();
          await expect(panel.getByRole("alert")).toContainText(
            /GEMINI_API_KEY/,
          );
          await expect(panel.getByTestId("ai-suggestions")).toHaveCount(0);
          if (feature === "screening") {
            await page
              .locator('[name="screening_notes"]')
              .fill(
                "Manual workflow remains usable when AI is not configured.",
              );
            await page
              .getByTestId("workflow-panel")
              .getByRole("button", { name: /Save progress/ })
              .click();
            await expect(
              page
                .getByTestId("workflow-panel")
                .getByText(/Saved successfully/),
            ).toBeVisible();
          }
        }
        const saved = await admin
          .from("application_workflow")
          .select("*")
          .eq("application_id", id)
          .single();
        expect(saved.error).toBeNull();
        const snapshot = JSON.stringify(saved.data);
        const events = await admin
          .from("application_events")
          .select("id", { count: "exact", head: true })
          .eq("application_id", id);
        if (feature === "decision") {
          await panel
            .getByRole("combobox", { name: /Human-selected action/ })
            .selectOption("REJECT");
          await panel
            .getByRole("textbox", { name: /Rationale context/ })
            .fill("Human-entered unresolved evidence discrepancy.");
        }
        let mode: "success" | "rate" | "failure" = "success";
        let release!: () => void;
        let gate: Promise<void> | null = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route(endpoint, async (route) => {
          const body = route.request().postDataJSON() as {
            version: number;
            language: "kn" | "en";
            humanAction?: string;
            rationale?: string;
          };
          expect(body.version).toBe(saved.data!.version);
          expect(Object.keys(body).sort()).toEqual(
            feature === "decision"
              ? ["humanAction", "language", "rationale", "version"]
              : ["language", "version"],
          );
          if (feature === "decision") expect(body.humanAction).toBe("REJECT");
          if (gate) await gate;
          if (mode === "rate") {
            await route.fulfill({
              status: 429,
              headers: {
                "content-type": "application/json",
                "Retry-After": "1",
              },
              body: JSON.stringify({
                ok: false,
                error: {
                  code: "AI_PROVIDER_RATE_LIMITED",
                  message: "Gemini is rate limited. Wait before retrying.",
                  retryAfterSeconds: 1,
                },
              }),
            });
            return;
          }
          if (mode === "failure") {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({
                ok: false,
                error: {
                  code: "AI_UNAVAILABLE",
                  message: "AI is temporarily unavailable. Continue manually.",
                },
              }),
            });
            return;
          }
          const kn = body.language === "kn";
          const suggestions: AiSuggestions = {
            language: body.language,
            summary: kn
              ? "UI ಪರೀಕ್ಷಾ ಕರಡು ಮಾತ್ರ: ಉಳಿಸಿದ ದತ್ತಾಂಶದ ಸಾರಾಂಶ."
              : "UI fixture only: a summary of saved records.",
            evidence: [
              kn ? "ಅಧಿಕಾರಿ ದಾಖಲಿಸಿದ ಮಾಹಿತಿ" : "Officer-recorded information",
            ],
            missingInformation: [
              kn
                ? "ಭೇಟಿ ಮಾಹಿತಿ ಇನ್ನೂ ದಾಖಲಾಗಿಲ್ಲ"
                : "Visit information is not recorded",
            ],
            questionsToVerify: [
              kn
                ? "ಮಾಹಿತಿಯನ್ನು ಅಧಿಕಾರಿ ಪರಿಶೀಲಿಸಿದ್ದಾರೆಯೇ?"
                : "Has the officer verified the information?",
            ],
            inconsistencies: [],
            unverifiedInformation: [
              kn ? "ಸ್ವತಂತ್ರ ದೃಢೀಕರಣ ಇಲ್ಲ" : "No independent verification",
            ],
            draft: kn
              ? "UI ಪರೀಕ್ಷಾ ಕರಡು ಮಾತ್ರ. ಉಳಿಸಿದ ವಿವರಗಳನ್ನು ಅಧಿಕಾರಿ ಪರಿಶೀಲಿಸಬೇಕು."
              : "UI fixture only. The officer must verify the saved details.",
          };
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              feature,
              sourceVersion: body.version,
              generatedAt: new Date().toISOString(),
              suggestions,
            }),
          });
        });
        await panel
          .getByRole("button", { name: /Generate Suggestions/ })
          .click();
        await expect(
          panel.getByRole("button", { name: /Generating/ }),
        ).toBeDisabled();
        await expect(
          page.getByTestId("workflow-panel").getByRole("button", {
            name:
              feature === "screening"
                ? /Save progress/
                : feature === "field"
                  ? /Save draft/
                  : feature === "review"
                    ? /Save review/
                    : /Approve/,
          }),
        ).toBeEnabled();
        release();
        gate = null;
        await expect(panel.getByTestId("ai-suggestions")).toBeVisible();
        const draft = panel.getByRole("textbox", { name: /Editable AI draft/ });
        await draft.fill("ಅಧಿಕಾರಿ ಸಂಪಾದಿಸಿದ UI ಪರೀಕ್ಷಾ ಕರಡು.");
        await panel.getByRole("button", { name: /Copy draft/ }).click();
        await expect(panel.getByRole("status")).toContainText(/Draft copied/);
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
          "ಅಧಿಕಾರಿ ಸಂಪಾದಿಸಿದ UI ಪರೀಕ್ಷಾ ಕರಡು.",
        );
        mode = "failure";
        await panel
          .getByRole("button", { name: /Generate Suggestions/ })
          .click();
        await expect(panel.getByRole("alert")).toContainText(
          /temporarily unavailable/,
        );
        await expect(draft).toHaveValue("ಅಧಿಕಾರಿ ಸಂಪಾದಿಸಿದ UI ಪರೀಕ್ಷಾ ಕರಡು.");
        mode = "rate";
        await panel
          .getByRole("button", { name: /Generate Suggestions/ })
          .click();
        await expect(panel.getByRole("alert")).toContainText(/rate limited/);
        await expect(
          panel.getByRole("button", { name: /Retry in/ }),
        ).toBeDisabled();
        mode = "success";
        await expect(
          panel.getByRole("button", { name: /Retry$/ }),
        ).toBeEnabled();
        await panel.getByRole("button", { name: /Retry$/ }).click();
        await expect(panel.getByRole("alert")).toHaveCount(0);
        await panel
          .getByRole("combobox", { name: /Suggestion language/ })
          .selectOption("en");
        await panel
          .getByRole("button", { name: /Generate Suggestions/ })
          .click();
        await expect(draft).toHaveValue(/UI fixture only/);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          JSON.stringify(
            (
              await admin
                .from("application_workflow")
                .select("*")
                .eq("application_id", id)
                .single()
            ).data,
          ),
        ).toBe(snapshot);
        expect(
          (
            await admin
              .from("application_events")
              .select("id", { count: "exact", head: true })
              .eq("application_id", id)
          ).count,
        ).toBe(events.count);
      } finally {
        await context.close();
      }
    }
  } finally {
    if (fixtures.length)
      expect(
        (await admin.from("applications").delete().in("id", fixtures)).error,
      ).toBeNull();
  }
});
