import { test } from "vitest";
import assert from "node:assert/strict";
import {
  catalogs,
  createTranslator,
  parseLanguage,
  requestLanguage,
  translateMessage,
  type MessageKey,
} from "../lib/i18n";
import {
  eventLabel,
  priorityReason,
  certificateLabel,
  locationLabel,
  officerLabel,
  documentLabel,
  demoRecordText,
} from "../lib/i18n/records";
import { createLoginSchema } from "../lib/validation";
import { stageLabel, workflowErrorMessage } from "../lib/workflow";
import { aiErrorResponse, AiError } from "../lib/ai/errors";

test("both catalogs cover every message and preserve interpolation values", () => {
  assert.deepEqual(
    Object.keys(catalogs.en).sort(),
    Object.keys(catalogs.kn).sort(),
  );
  for (const key of Object.keys(catalogs.en) as MessageKey[]) {
    for (const locale of ["kn", "en"] as const)
      assert.ok(catalogs[locale][key].trim(), `${locale}: ${key}`);
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      placeholders(catalogs.kn[key]),
      placeholders(catalogs.en[key]),
      key,
    );
  }
  const t = createTranslator("kn");
  assert.equal(t("Dashboard"), "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್");
  assert.equal(t("Pending applications"), "ಬಾಕಿ ಇರುವ ಅರ್ಜಿಗಳು");
  assert.equal(t("Approve"), "ಅನುಮೋದಿಸಿ");
  assert.equal(t("Reject"), "ತಿರಸ್ಕರಿಸಿ");
  assert.equal(t("Return"), "ಹಿಂತಿರುಗಿಸಿ");
  assert.equal(
    t("Page {page} of {total}", { page: 2, total: 3 }),
    "ಒಟ್ಟು 3 ಪುಟಗಳಲ್ಲಿ 2ನೇ ಪುಟ",
  );
  assert.equal(createTranslator("en")("{count} days", { count: 5 }), "5 days");
  assert.equal(
    t("View details for {number}", { number: "<script>" }),
    "<script> ಅರ್ಜಿಯ ವಿವರಗಳನ್ನು ವೀಕ್ಷಿಸಿ",
  );
});

test("database-backed interface and demo labels follow the locale without changing case evidence", () => {
  assert.equal(locationLabel("ಮೈಸೂರು", "en"), "Mysuru");
  assert.equal(locationLabel("Mysuru", "kn"), "ಮೈಸೂರು");
  assert.equal(locationLabel("ಮಾದರಿ ಗ್ರಾಮ ೨", "en"), "Demo village 2");
  assert.equal(locationLabel("ಮಾದರಿ ಗ್ರಾಮ ೨", "kn"), "ಮಾದರಿ ಗ್ರಾಮ ೨");
  assert.equal(officerLabel("ಮಾದರಿ ನಿರ್ವಾಹಕರು", "en"), "Demo operator");
  assert.equal(officerLabel("Anamika", "kn"), "Anamika");
  assert.equal(documentLabel("ಆದಾಯ ಘೋಷಣೆ / Income declaration", "en"), "Income declaration");
  assert.equal(documentLabel("Income declaration", "kn"), "ಆದಾಯ ಘೋಷಣೆ");
  assert.equal(certificateLabel("INCOME", "kn"), "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ");
  assert.equal(demoRecordText("ಮಾದರಿ ಅರ್ಜಿದಾರ ಅ", "en", true), "Demo applicant 1");
  assert.equal(demoRecordText("ವಿದ್ಯಾರ್ಥಿವೇತನ / Scholarship", "en", true), "Scholarship");
  assert.equal(demoRecordText("ವಿದ್ಯಾರ್ಥಿವೇತನ / Scholarship", "kn", true), "ವಿದ್ಯಾರ್ಥಿವೇತನ");
  const note = "ಪ್ರಾತ್ಯಕ್ಷಿಕೆಗಾಗಿ ಮಾತ್ರ. ಎಲ್ಲಾ ವಿವರಗಳು ಕಾಲ್ಪನಿಕ. / Demo only. All details are fictional.";
  assert.equal(demoRecordText(note, "en", true), "Demo only. All details are fictional.");
  for (const value of ["Anamika / ಅನಾಮಿಕಾ", "North / South", "Officer notes must remain exactly as recorded.", note]) {
    for (const locale of ["kn", "en"] as const) {
      assert.equal(demoRecordText(value, locale, false), value);
      assert.equal(documentLabel(value, locale), value);
      assert.equal(locationLabel(value, locale), value);
    }
  }
  assert.equal(demoRecordText("Custom demo officer note", "kn", true), "Custom demo officer note");
});
test("language preferences are allowlisted with Kannada as the default", () => {
  for (const value of [undefined, null, "", "fr", "EN", "<script>", ["en"]])
    assert.equal(parseLanguage(value), "kn");
  assert.equal(parseLanguage("en"), "en");
  assert.equal(
    requestLanguage("auth=value; sevasathi_language=en; another=1"),
    "en",
  );
  assert.equal(requestLanguage("sevasathi_language=%E0%A4%A"), "kn");
  assert.equal(requestLanguage("fake_sevasathi_language=en"), "kn");
  assert.equal(requestLanguage(null), "kn");
});
test("validation, workflow and AI failures follow the selected language without changing records", async () => {
  for (const locale of ["kn", "en"] as const) {
    const invalid = createLoginSchema(locale).safeParse({
      email: "bad",
      password: "",
    });
    assert.equal(invalid.success, false);
    if (!invalid.success)
      assert.equal(
        invalid.error.issues[0].message,
        createTranslator(locale)("Enter a valid email"),
      );
    const response = aiErrorResponse(
      new AiError("AI_RATE_LIMITED", 429, 60),
      locale,
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    assert.equal(
      (await response.json()).error.message,
      createTranslator(locale)(
        "AI request limit reached. Wait before retrying; manual work remains available.",
      ),
    );
  }
  assert.match(
    workflowErrorMessage("WORKFLOW_REASON_REQUIRED", "kn"),
    /ಕನಿಷ್ಠ 5/,
  );
  assert.match(
    workflowErrorMessage("WORKFLOW_REASON_REQUIRED", "en"),
    /at least 5/,
  );
  assert.equal(stageLabel("PENDING_APPROVAL", "en"), "Final decision");
  assert.equal(
    eventLabel("APPLICATION_RESUMED", "kn"),
    "ಸ್ಪಷ್ಟೀಕರಣದ ನಂತರ ಪುನರಾರಂಭಿಸಲಾಗಿದೆ",
  );
  assert.equal(
    priorityReason("3 ದಿನ ಗುರಿ ಮೀರಿದೆ / day(s) past demo target", "en"),
    "3 days past target date",
  );
  assert.equal(
    priorityReason("Officer entered / free text", "kn"),
    "Officer entered / free text",
  );
  assert.equal(translateMessage("Draft copied", "kn"), "ಕರಡು ನಕಲಿಸಲಾಗಿದೆ");
  assert.equal(
    certificateLabel("ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ / Income certificate", "en"),
    "Income certificate",
  );
  assert.equal(
    certificateLabel("Custom recorded certificate", "kn"),
    "Custom recorded certificate",
  );
});
