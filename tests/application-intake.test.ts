import { expect, test } from "vitest";
import { createApplicationSchema, INTAKE_DOCUMENTS, intakeToday } from "../lib/application-intake";

const valid = () => ({
  requestId: "91000000-0000-4000-8000-000000000001",
  applicant_name: "  ಮಾದರಿ ಅರ್ಜಿದಾರರು  ",
  village: "  Demonstration village  ",
  annual_income: "48000.50",
  purpose: "  Fictional income-certificate application  ",
  certificate_type: "INCOME",
  application_date: intakeToday(),
  documents: INTAKE_DOCUMENTS.map(({ key }) => ({ key, status: "MISSING" })),
  notes: "  Optional intake notes  ",
});

test("intake normalizes text, preserves Kannada and converts decimal income without accepting workflow authority", () => {
  expect(createApplicationSchema("en").parse(valid())).toEqual({
    requestId: "91000000-0000-4000-8000-000000000001",
    applicant_name: "ಮಾದರಿ ಅರ್ಜಿದಾರರು",
    village: "Demonstration village",
    annual_income: 48000.5,
    purpose: "Fictional income-certificate application",
    certificate_type: "INCOME",
    application_date: intakeToday(),
    documents: INTAKE_DOCUMENTS.map(({ key }) => ({ key, status: "MISSING" })),
    notes: "Optional intake notes",
  });
});

test("intake validates dates, service, document completeness and optional notes", () => {
  const schema = createApplicationSchema("en");
  for (const application_date of ["", "2026-02-30", "2099-01-01", "1899-12-31", null]) {
    expect(schema.safeParse({ ...valid(), application_date }).success).toBe(false);
  }
  expect(schema.safeParse({ ...valid(), certificate_type: "OTHER" }).success).toBe(false);
  for (const documents of [[], valid().documents.slice(1), [valid().documents[0], valid().documents[0], valid().documents[2]],
    [...valid().documents.slice(0, 2), { key: "forged_document", status: "RECEIVED" }]]) {
    expect(schema.safeParse({ ...valid(), documents }).success).toBe(false);
  }
  expect(schema.safeParse({ ...valid(), notes: "x".repeat(4001) }).success).toBe(false);
  expect(schema.parse({ ...valid(), notes: undefined }).notes).toBe("");
  expect(intakeToday(new Date("2026-10-30T20:00:00Z"))).toBe("2026-10-31");
});

test("intake rejects client-supplied roles, jurisdiction, status, ownership and dates", () => {
  const schema = createApplicationSchema("en");
  for (const [key, value] of Object.entries({
    role: "APPROVING_OFFICER",
    district: "Another district",
    taluk: "Another taluk",
    status: "APPROVED",
    created_by: "92000000-0000-4000-8000-000000000001",
    operator_id: "92000000-0000-4000-8000-000000000001",
    assigned_field_officer_id: "92000000-0000-4000-8000-000000000001",
    submitted_at: "2099-01-01T00:00:00.000Z",
    target_date: "2099-01-01",
    is_demo: false,
  })) {
    expect(schema.safeParse({ ...valid(), [key]: value }).success, key).toBe(false);
  }
});

test("income accepts zero and the documented upper bound with at most two decimal places", () => {
  const schema = createApplicationSchema("en");
  for (const value of ["0", "0.01", "1.2", "9999999999.99"]) {
    const result = schema.safeParse({ ...valid(), annual_income: value });
    expect(result.success, value).toBe(true);
    if (result.success) expect(result.data.annual_income).toBe(Number(value));
  }
});

test("income rejects fractional rounding, scientific notation, nonfinite values and out-of-range input", () => {
  const schema = createApplicationSchema("en");
  for (const value of [
    "", " ", "-1", "0.001", "12.345", "1e3", "NaN", "Infinity",
    "0x10", "1,000", ".50", "100.", "10000000000", "10000000000.00",
    48000, null, true,
  ]) {
    expect(schema.safeParse({ ...valid(), annual_income: value }).success, String(value)).toBe(false);
  }
});

test("required intake text fields reject blanks and enforce their length boundaries", () => {
  const schema = createApplicationSchema("en");
  for (const [key, limit] of [["applicant_name", 120], ["village", 120], ["purpose", 500]] as const) {
    for (const value of ["", "   ", "x".repeat(limit + 1), null, 123]) {
      expect(schema.safeParse({ ...valid(), [key]: value }).success, `${key}: ${String(value)}`).toBe(false);
    }
    expect(schema.safeParse({ ...valid(), [key]: "x".repeat(limit) }).success, key).toBe(true);
  }
});

test("every creation attempt requires a valid request identity for safe retries", () => {
  const schema = createApplicationSchema("en");
  for (const requestId of [undefined, null, "", "not-a-uuid", 123]) {
    expect(schema.safeParse({ ...valid(), requestId }).success).toBe(false);
  }
  const { requestId: omitted, ...withoutRequest } = valid();
  expect(omitted).toBeTruthy();
  expect(schema.safeParse(withoutRequest).success).toBe(false);
});

test("intake validation reports localized field errors in Kannada and English", () => {
  const input = { ...valid(), applicant_name: "   " };
  const english = createApplicationSchema("en").safeParse(input);
  const kannada = createApplicationSchema("kn").safeParse(input);
  expect(english.success).toBe(false);
  expect(kannada.success).toBe(false);
  if (!english.success && !kannada.success) {
    expect(english.error.issues[0].path).toEqual(["applicant_name"]);
    expect(kannada.error.issues[0].path).toEqual(["applicant_name"]);
    expect(kannada.error.issues[0].message).not.toBe(english.error.issues[0].message);
    expect(kannada.error.issues[0].message.trim()).not.toBe("");
  }
});
