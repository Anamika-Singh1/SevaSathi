const secretNames = [
  "SUPABASE_SECRET_KEY", "GEMINI_API_KEY", "DEMO_OPERATOR_PASSWORD",
  "DEMO_FIELD_OFFICER_PASSWORD", "DEMO_CASEWORKER_PASSWORD", "DEMO_APPROVING_OFFICER_PASSWORD",
] as const;

export function redactSecrets(text: string, env: Readonly<Record<string, string | undefined>> = process.env) {
  const values = secretNames.flatMap(name => {
    const value = env[name];
    return value && value.length >= 10 ? [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1), Buffer.from(value).toString("base64")] : [];
  }).sort((a, b) => b.length - a.length);
  let result = text;
  for (const value of new Set(values)) result = result.split(value).join("[REDACTED]");
  return result.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED JWT]")
    .replace(/\bsb_secret_[A-Za-z0-9_-]+\b/g, "[REDACTED KEY]");
}
