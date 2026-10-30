import { test } from "vitest";
import assert from "node:assert/strict";
import { assertDemoUserDefinitions, DEMO_USERS } from "../scripts/demo-users";

const definitions = (): {
  role: string; email: string; name: string; passwordEnv: string;
}[] => DEMO_USERS.map((user) => ({ ...user }));

test("canonical demo definitions contain four distinct roles, emails and environment names", () => {
  assert.doesNotThrow(() => assertDemoUserDefinitions(DEMO_USERS));
  assert.equal(DEMO_USERS.length, 4);
  assert.equal(new Set(DEMO_USERS.map((user) => user.email)).size, 4);
  for (const user of DEMO_USERS) {
    assert.ok(user.email.endsWith("@sevasathi.example.com"));
    assert.equal(user.passwordEnv, `DEMO_${user.role}_PASSWORD`);
  }
});

test("demo preflight rejects duplicate emails after case and whitespace normalization", () => {
  const users = definitions();
  users[1].email = `  ${users[0].email.toUpperCase()}  `;
  assert.throws(() => assertDemoUserDefinitions(users), /Invalid demo account configuration/);
});

test("demo preflight rejects missing, duplicate and unknown roles", () => {
  assert.throws(() => assertDemoUserDefinitions(definitions().slice(0, 3)));
  const duplicate = definitions();
  duplicate[1].role = duplicate[0].role;
  duplicate[1].passwordEnv = duplicate[0].passwordEnv;
  assert.throws(() => assertDemoUserDefinitions(duplicate));
  const unknown = definitions();
  unknown[0].role = "ADMIN";
  assert.throws(() => assertDemoUserDefinitions(unknown));
});

test("demo preflight rejects pasted credentials without echoing them in errors", () => {
  const users = definitions();
  const syntheticCredential = "synthetic-password-not-for-login";
  users[0].passwordEnv = syntheticCredential;
  assert.throws(() => assertDemoUserDefinitions(users), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Invalid demo account configuration/);
    assert.equal(error.message.includes(syntheticCredential), false);
    return true;
  });
});

test("demo preflight rejects another role's password environment variable", () => {
  const users = definitions();
  users[0].passwordEnv = "DEMO_APPROVING_OFFICER_PASSWORD";
  assert.throws(() => assertDemoUserDefinitions(users));
});
