import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const generated = execFileSync(
    process.execPath,
    [
      resolve("node_modules/supabase/dist/supabase.js"),
      "gen",
      "types",
      "typescript",
      "--local",
      "--schema",
      "public",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (!generated.includes("export type Database"))
    throw new Error("No schema types returned.");
  writeFileSync(resolve("types/database.ts"), generated, "utf8");
  console.log("Generated types/database.ts from the local public schema.");
} catch {
  console.error(
    "Database type generation failed. Start local Supabase and apply migrations first. The existing type file was preserved.",
  );
  process.exitCode = 1;
}
