import { beforeEach, expect, test, vi } from "vitest";
import { createTranslator, type Language } from "../lib/i18n";
import { INTAKE_DOCUMENTS, intakeToday } from "../lib/application-intake";

const mocks = vi.hoisted(() => ({
  getI18n: vi.fn(),
  requireOfficer: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/i18n/server", () => ({ getI18n: mocks.getI18n }));
vi.mock("@/lib/auth", () => ({ requireOfficer: mocks.requireOfficer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createApplication } from "../app/(workspace)/applications/new/actions";

const requestId = "93000000-0000-4000-8000-000000000001";
const applicationId = "94000000-0000-4000-8000-000000000001";
const referenceNumber = "SS-2026-900001";
const missingMigrationMessage =
  "Application creation is not configured. Ask the administrator to apply the application intake migration.";

function input() {
  return {
    requestId,
    applicant_name: "  ಮಾದರಿ ಅರ್ಜಿದಾರರು  ",
    village: "  Demonstration village  ",
    annual_income: "48000.50",
    purpose: "  Fictional certificate for an evaluator walkthrough  ",
    certificate_type: "INCOME",
    application_date: intakeToday(),
    documents: INTAKE_DOCUMENTS.map(({ key }) => ({ key, status: "MISSING" })),
    notes: "  Optional application note  ",
  };
}

function setLanguage(locale: Language) {
  mocks.getI18n.mockResolvedValue({ locale, t: createTranslator(locale) });
}

beforeEach(() => {
  vi.resetAllMocks();
  setLanguage("en");
  mocks.requireOfficer.mockResolvedValue({
    user: { id: "95000000-0000-4000-8000-000000000001" },
    profile: {
      id: "95000000-0000-4000-8000-000000000001",
      role: "OPERATOR",
      district: "ಮೈಸೂರು",
      taluk: "ಮೈಸೂರು",
    },
  });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({
    data: { application_id: applicationId, reference_number: referenceNumber, duplicate: false },
    error: null,
  });
});

test("creation requires an operator and a denied officer never reaches the database", async () => {
  mocks.requireOfficer.mockImplementation(async (roles: readonly string[]) => {
    expect(roles).toEqual(["OPERATOR"]);
    throw new Error("TEST_FORBIDDEN_OFFICER");
  });

  await expect(createApplication(input())).rejects.toThrow("TEST_FORBIDDEN_OFFICER");

  expect(mocks.requireOfficer).toHaveBeenCalledExactlyOnceWith(["OPERATOR"]);
  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

test("invalid intake data and forged workflow authority cause no database call", async () => {
  for (const invalid of [
    null,
    { ...input(), requestId: "not-a-uuid" },
    { ...input(), annual_income: "12.345" },
    { ...input(), applicant_name: "   " },
    { ...input(), status: "APPROVED" },
    { ...input(), district: "Other district", role: "APPROVING_OFFICER" },
  ]) {
    const result = await createApplication(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.trim()).not.toBe("");
  }

  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

test("valid creation sends only normalized intake fields through the user-session RPC and refreshes lists", async () => {
  const result = await createApplication(input());

  expect(mocks.requireOfficer).toHaveBeenCalledExactlyOnceWith(["OPERATOR"]);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_application", {
    request_id: requestId,
    applicant_name: "ಮಾದರಿ ಅರ್ಜಿದಾರರು",
    village: "Demonstration village",
    annual_income: 48000.5,
    purpose: "Fictional certificate for an evaluator walkthrough",
    certificate_type: "INCOME",
    application_date: intakeToday(),
    documents: INTAKE_DOCUMENTS.map(({ key }) => ({ key, status: "MISSING" })),
    notes: "Optional application note",
  });
  expect(result).toEqual({ ok: true, applicationId, referenceNumber });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/applications");
});

test("database intake denials are sanitized and do not refresh successful application lists", async () => {
  for (const code of ["INTAKE_FORBIDDEN", "INTAKE_INVALID_INPUT", "INTAKE_REQUEST_REUSED", "INTAKE_UNAVAILABLE"]) {
    const diagnostic = `raw-database-diagnostic-${code}`;
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code, details: diagnostic } });

    const result = await createApplication(input());

    expect(result.ok, code).toBe(false);
    if (!result.ok) expect(result.message.trim()).not.toBe("");
    expect(JSON.stringify(result)).not.toContain(diagnostic);
  }
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

test("unknown provider errors and thrown connection failures never expose raw diagnostics", async () => {
  const diagnostic = "sensitive-provider-diagnostic-never-return";
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "XX000", message: diagnostic, details: diagnostic },
  });
  const providerFailure = await createApplication(input());
  expect(providerFailure.ok).toBe(false);
  expect(JSON.stringify(providerFailure)).not.toContain(diagnostic);

  mocks.rpc.mockRejectedValue(new Error(diagnostic));
  const connectionFailure = await createApplication(input());
  expect(connectionFailure.ok).toBe(false);
  expect(JSON.stringify(connectionFailure)).not.toContain(diagnostic);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

test("server failure diagnostics include safe codes without applicant data or provider details", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "private-provider-diagnostic" } });
    await createApplication(input());
    expect(log).toHaveBeenCalledWith("[application-intake] RPC failed", {
      code: "PGRST202", reason: "PROVIDER_ERROR", requestId,
    });
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain("private-provider-diagnostic");
    expect(output).not.toContain(input().applicant_name.trim());
  } finally {
    log.mockRestore();
  }
});

test.each(["kn", "en"] as const)(
  "%s missing-RPC errors explain the migration prerequisite without leaking PostgREST details",
  async (locale) => {
    setLanguage(locale);
    const diagnostic = "raw-postgrest-schema-cache-diagnostic";
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: diagnostic, details: diagnostic },
    });

    const result = await createApplication(input());

    expect(result).toEqual({ ok: false, message: createTranslator(locale)(missingMigrationMessage) });
    expect(JSON.stringify(result)).not.toContain(diagnostic);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  },
);

test("invalid RPC success data fails closed instead of navigating to an unverified application", async () => {
  for (const data of [
    null,
    {},
    { application_id: "not-a-uuid", reference_number: referenceNumber, duplicate: false },
    { application_id: applicationId, reference_number: "", duplicate: false },
    { application_id: applicationId, duplicate: false },
    { application_id: applicationId, reference_number: referenceNumber },
  ]) {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const result = await createApplication(input());
    expect(result.ok).toBe(false);
  }
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
