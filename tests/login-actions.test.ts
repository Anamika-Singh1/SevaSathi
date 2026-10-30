import { beforeEach, expect, test, vi } from "vitest";
import { createTranslator, type Language } from "../lib/i18n";

const mocks = vi.hoisted(() => ({
  getI18n: vi.fn(),
  getSupabaseConfig: vi.fn(),
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/i18n/server", () => ({ getI18n: mocks.getI18n }));
vi.mock("@/lib/env", () => ({ getSupabaseConfig: mocks.getSupabaseConfig }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { login } from "../app/login/actions";

const officerId = "90000000-0000-4000-8000-000000000001";
const lookupMessage =
  "Unable to verify officer access. Try again or ask your administrator to check the database setup.";
const inactiveMessage =
  "An active officer profile is required. Contact your administrator.";

function setLanguage(locale: Language) {
  mocks.getI18n.mockResolvedValue({ locale, t: createTranslator(locale) });
}

function credentials(next = "/dashboard") {
  const form = new FormData();
  form.set("email", "  Officer@EXAMPLE.COM  ");
  form.set("password", "synthetic-login-test-password");
  form.set("next", next);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  setLanguage("en");
  mocks.getSupabaseConfig.mockReturnValue({
    url: "https://supabase.example.test",
    key: "publishable-test-fixture-only",
  });
  mocks.signInWithPassword.mockResolvedValue({
    data: { user: { id: officerId } },
    error: null,
  });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { role: "OPERATOR" }, error: null });
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    maybeSingle: mocks.maybeSingle,
  };
  mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.createClient.mockResolvedValue({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  });
  // Next.js redirects throw a control-flow exception instead of returning.
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`TEST_REDIRECT:${path}`);
  });
});

test.each(["kn", "en"] as const)(
  "%s profile lookup failures return sanitized retry guidance and end the new session",
  async (locale) => {
    setLanguage(locale);
    const diagnostic = "raw-database-diagnostic-do-not-expose";
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: diagnostic, code: "42501", details: diagnostic },
    });

    const result = await login({}, credentials());

    expect(result).toEqual({ error: createTranslator(locale)(lookupMessage) });
    expect(result.error).not.toBe(createTranslator(locale)(inactiveMessage));
    expect(JSON.stringify(result)).not.toContain(diagnostic);
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  },
);

test.each(["kn", "en"] as const)(
  "%s a successful lookup without an active profile requests administrator activation",
  async (locale) => {
    setLanguage(locale);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await login({}, credentials());

    expect(result).toEqual({ error: createTranslator(locale)(inactiveMessage) });
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("profiles");
    expect(mocks.eq).toHaveBeenCalledWith("id", officerId);
    expect(mocks.eq).toHaveBeenCalledWith("is_active", true);
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  },
);

test("authentication failure never queries profiles or exposes Auth diagnostics", async () => {
  const diagnostic = "raw-auth-diagnostic-do-not-expose";
  mocks.signInWithPassword.mockResolvedValue({
    data: { user: null },
    error: { message: diagnostic },
  });

  const result = await login({}, credentials());

  expect(result).toEqual({
    error: "Unable to sign in. Check your details or try again shortly.",
  });
  expect(JSON.stringify(result)).not.toContain(diagnostic);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});

test("an active operator signs in with normalized email and safe role-allowed redirects", async () => {
  for (const [next, destination] of [
    ["https://external.example/path", "/dashboard"],
    ["/decisions", "/dashboard"],
    ["/applications?status=SUBMITTED", "/applications?status=SUBMITTED"],
  ]) {
    await expect(login({}, credentials(next))).rejects.toThrow(
      `TEST_REDIRECT:${destination}`,
    );
    expect(mocks.redirect).toHaveBeenLastCalledWith(destination);
  }

  expect(mocks.signInWithPassword).toHaveBeenCalledWith({
    email: "officer@example.com",
    password: "synthetic-login-test-password",
  });
  expect(mocks.select).toHaveBeenCalledWith("role");
  expect(mocks.eq).toHaveBeenCalledWith("id", officerId);
  expect(mocks.eq).toHaveBeenCalledWith("is_active", true);
  expect(mocks.signOut).not.toHaveBeenCalled();
});

test("malformed login inputs fail validation before constructing an Auth client", async () => {
  const form = new FormData();
  form.set("email", "invalid-email");
  form.set("password", "");

  const result = await login({}, form);

  expect(result.fieldErrors?.email).toEqual(["Enter a valid email"]);
  expect(result.fieldErrors?.password).toEqual(["Enter your password"]);
  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
