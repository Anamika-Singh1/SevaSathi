import { test } from "vitest";
import assert from "node:assert/strict";
import {
  ROLES,
  canAccessPath,
  isProtectedPath,
  safeNextPath,
} from "../lib/roles";
import { loginSchema, applicationIdSchema } from "../lib/validation";

test("all required workspace routes are protected, including nested paths", () => {
  for (const path of [
    "/dashboard",
    "/applications",
    "/applications/123",
    "/field-work",
    "/reviews",
    "/decisions",
    "/settings",
  ])
    assert.equal(isProtectedPath(path), true);
  for (const path of ["/login", "/applications-evil", "/", "/other"])
    assert.equal(isProtectedPath(path), false);
});

test("every role has shared routes and only its own specialized queue", () => {
  for (const role of ROLES) {
    for (const path of [
      "/dashboard",
      "/applications",
      "/applications/123",
      "/settings",
    ])
      assert.equal(canAccessPath(role, path), true);
    assert.equal(canAccessPath(role, "/field-work"), role === "FIELD_OFFICER");
    assert.equal(canAccessPath(role, "/reviews"), role === "CASEWORKER");
    assert.equal(canAccessPath(role, "/applications/new"), role === "OPERATOR");
    assert.equal(canAccessPath(role, "/applications/new/extra"), role === "OPERATOR");
    assert.equal(
      canAccessPath(role, "/decisions"),
      role === "APPROVING_OFFICER",
    );
  }
});

test("login redirect rejects external URLs, encoded path tricks, and redirect loops", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/login",
    "/applications/../../login",
    "/%2f%2fevil.example",
    "\n/dashboard",
    "/dashboard\r\n",
    null,
    ["/dashboard"],
  ])
    assert.equal(safeNextPath(value), "/dashboard");
  assert.equal(
    safeNextPath("/applications/123?from=search"),
    "/applications/123?from=search",
  );
  assert.equal(safeNextPath("/reviews"), "/reviews");
});

test("login validation normalizes email and accepts no role input", () => {
  assert.deepEqual(
    loginSchema.parse({
      email: "Officer@EXAMPLE.COM",
      password: "a-password",
      role: "APPROVING_OFFICER",
    }),
    { email: "officer@example.com", password: "a-password" },
  );
  assert.equal(
    loginSchema.safeParse({ email: "not-email", password: "" }).success,
    false,
  );
  assert.equal(applicationIdSchema.safeParse("not-a-uuid").success, false);
});
