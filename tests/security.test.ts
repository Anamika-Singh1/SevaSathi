import { test } from "vitest";
import assert from "node:assert/strict";
import { redactSecrets } from "./support/redact";

test("failure diagnostics redact known credentials, escaped values and bearer tokens", () => {
  const password = 'demo-test-$\\"secret';
  const values = [password, encodeURIComponent(password), JSON.stringify(password).slice(1, -1), Buffer.from(password).toString("base64")];
  for (const value of values) assert.equal(redactSecrets(`Password: ${value}`, { DEMO_OPERATOR_PASSWORD: password }), "Password: [REDACTED]");
  assert.equal(redactSecrets("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.signature"), "Bearer [REDACTED JWT]");
  assert.equal(redactSecrets("sb_secret_fixture_only"), "[REDACTED KEY]");
  assert.equal(redactSecrets("Set GEMINI_API_KEY on the server. Public app labels remain readable."), "Set GEMINI_API_KEY on the server. Public app labels remain readable.");
});
