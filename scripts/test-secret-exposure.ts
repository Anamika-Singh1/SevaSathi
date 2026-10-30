import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const names = ["SUPABASE_SECRET_KEY", "GEMINI_API_KEY", "DEMO_OPERATOR_PASSWORD", "DEMO_FIELD_OFFICER_PASSWORD", "DEMO_CASEWORKER_PASSWORD", "DEMO_APPROVING_OFFICER_PASSWORD"];
const secrets = names.flatMap(name => {
  const value = process.env[name];
  return value && value.length >= 10 ? [{ name, variants: [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1), Buffer.from(value).toString("base64")] }] : [];
});
let failures = 0;
function scan(dir: string) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { scan(path); continue; }
    if (!/\.(js|mjs|cjs|map|json|html|md|txt|log|css)$/i.test(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const secret of secrets) if (secret.variants.some(value => content.includes(value))) {
      console.error(`Secret value detected for ${secret.name} in ${path}`); failures++;
    }
    if (path.startsWith(join(".next", "static")) && /GoogleGenAI|generativelanguage\.googleapis\.com|sdk-test-key/.test(content)) {
      console.error(`Server SDK or test transport fixture detected in client artifact ${path}`); failures++;
    }
  }
}
if (!existsSync(".next/static")) { console.error("Build the app before checking client artifacts."); process.exitCode = 1; }
else {
  for (const dir of [".next/static", "test-results", ".qa"]) scan(dir);
  if (failures) process.exitCode = 1;
  else console.log(`PASS: client/test/log artifacts contain none of the ${secrets.length} configured secret values; Gemini SDK/test transport is absent from client code. Missing Gemini credentials are not counted as a live-provider check.`);
}
