import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { DEMO_USERS } from "./demo-users";

function main() {
  const file = resolve(".env.local");
  if (existsSync(file))
    throw new Error(
      ".env.local already exists. Refusing to overwrite your configuration.",
    );
  let output: string;
  try {
    output = execFileSync(
      process.execPath,
      [
        resolve("node_modules/supabase/dist/supabase.js"),
        "status",
        "-o",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    throw new Error("Local Supabase is not ready. Run npm run db:start first.");
  }
  const status = z
    .object({
      API_URL: z.url(),
      ANON_KEY: z.string().min(20),
      SERVICE_ROLE_KEY: z.string().min(20),
    })
    .parse(JSON.parse(output));
  if (!["127.0.0.1", "localhost"].includes(new URL(status.API_URL).hostname))
    throw new Error("This helper only configures local Supabase.");
  const lines = [
    "# Generated for the disposable local SevaSathi demo. Never commit or share.",
    `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}`,
    `SUPABASE_SECRET_KEY=${status.SERVICE_ROLE_KEY}`,
    ...DEMO_USERS.map(
      (user) =>
        `${user.passwordEnv}=${randomBytes(24).toString("base64url")}Aa1!`,
    ),
    "SEVASATHI_TEST_DEMO_PROJECT=true",
    "TEST_BASE_URL=http://127.0.0.1:3000",
    "",
  ];
  writeFileSync(file, lines.join("\n"), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    "Created ignored .env.local with local project values and four generated passwords. Secrets were not printed. Run npm run demo:setup.",
  );
}

try {
  main();
} catch {
  console.error(
    "Local environment setup failed. Ensure local Supabase is running and .env.local does not already exist. No secrets were printed.",
  );
  process.exitCode = 1;
}
