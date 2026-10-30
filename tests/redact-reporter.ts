import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { redactSecrets } from "./support/redact";

function redactFile(path: string) {
  if (!existsSync(path) || !/\.(md|json|txt|log|html)$/i.test(path)) return;
  const source = readFileSync(path, "utf8"), redacted = redactSecrets(source);
  if (source !== redacted) writeFileSync(path, redacted);
}
export default class SecretRedactionReporter implements Reporter {
  private failed = false;
  printsToStdio() { return false; }
  onTestEnd(_test: TestCase, result: TestResult) {
    try {
    for (const error of result.errors) {
      if (error.message) error.message = redactSecrets(error.message);
      if (error.stack) error.stack = redactSecrets(error.stack);
      if (error.snippet) error.snippet = redactSecrets(error.snippet);
      if (error.value) error.value = redactSecrets(error.value);
    }
    for (const attachment of result.attachments) {
      if (attachment.path) redactFile(attachment.path);
      if (attachment.body && /^(text\/|application\/json)/.test(attachment.contentType)) attachment.body = Buffer.from(redactSecrets(attachment.body.toString("utf8")));
    }
    } catch { this.failed = true; }
  }
  async onEnd() {
    try {
      if (existsSync("test-results")) for (const file of readdirSync("test-results", { recursive: true })) if (typeof file === "string") redactFile(join("test-results", file));
    } catch { this.failed = true; }
    if (this.failed) { console.error("Test diagnostic redaction failed; do not share the artifacts."); return { status: "failed" as const }; }
  }
}
