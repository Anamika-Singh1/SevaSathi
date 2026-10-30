import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (process.env.SEVASATHI_TEST_DEMO_PROJECT !== "true" || !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error("Security database checks require an opted-in disposable local Supabase project.");
  process.exitCode = 1;
} else {
  try {
    execFileSync("docker", ["exec", "-i", "supabase_db_sevasathi", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: readFileSync("tests/database/security-review.sql"), stdio: ["pipe", "inherit", "inherit"] });
  } catch {
    console.error("Database security review failed. Inspect the local schema and grants."); process.exitCode = 1;
  }
}
