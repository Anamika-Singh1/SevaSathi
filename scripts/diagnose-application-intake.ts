import { createClient } from "@supabase/supabase-js";

// Uses only the public key and a normal officer login. The null-input RPC probe
// fails validation before insertion and never creates an application.
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const password = process.env.DEMO_OPERATOR_PASSWORD;
  if (!url || !key) throw new Error("Public Supabase configuration is missing.");
  console.log(`Supabase project: ${new URL(url).origin}`);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const table of ["profiles", "applications", "application_workflow", "application_checklist", "application_events"]) {
    const { error, status } = await client.from(table).select("*", { head: true }).limit(0);
    console.log(`${table}: anonymous HTTP ${status}, ${error?.code ?? (status < 300 ? "readable" : "access denied")}`);
  }
  if (!password) {
    console.log("Officer password unavailable; authenticated checks were skipped.");
    return;
  }
  const { data, error } = await client.auth.signInWithPassword({
    email: "operator@sevasathi.example.com", password,
  });
  if (error || !data.user) {
    console.log(`Normal operator authentication failed: ${error?.code ?? "no_user"}.`);
    process.exitCode = 1;
    return;
  }
  try {
    console.log("Normal operator authentication: passed.");
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("id,role,is_active,district,taluk").eq("id", data.user.id).maybeSingle();
    console.log(`Officer profile: ${profileError?.code ?? (profile ? `${profile.role}, active=${profile.is_active}` : "not visible")}.`);
    if (profileError || !profile || profile.role !== "OPERATOR" || !profile.is_active) process.exitCode = 1;
    const specification = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${data.session!.access_token}`, Accept: "application/openapi+json" },
    });
    if (specification.ok) {
      const spec = await specification.json();
      const path = spec.paths?.["/rpc/create_application"];
      console.log(`create_application exposed by PostgREST: ${Boolean(path)}.`);
      console.log(`applications columns: ${Object.keys(spec.definitions?.applications?.properties ?? {}).join(", ")}.`);
    }
    const { error: rpcError } = await client.rpc("create_application", {
      request_id: null, applicant_name: null, village: null, annual_income: null, purpose: null,
    });
    const known = ["INTAKE_INVALID_INPUT", "INTAKE_FORBIDDEN", "INTAKE_UNAVAILABLE"];
    console.log(`Null-input creation probe: ${rpcError?.code ?? "unexpected success"}, ${known.includes(rpcError?.message ?? "") ? rpcError!.message : "provider details omitted"}.`);
    const { error: fullError } = await client.rpc("create_application", {
      request_id: null, applicant_name: null, village: null, annual_income: null, purpose: null,
      application_date: null, certificate_type: null, documents: null, notes: null,
    });
    console.log(`Full intake null-input probe: ${fullError?.code ?? "unexpected success"}, ${known.includes(fullError?.message ?? "") ? fullError!.message : "provider details omitted"}.`);
    if (fullError?.message !== "INTAKE_INVALID_INPUT") process.exitCode = 1;
  } finally {
    await client.auth.signOut({ scope: "local" });
    console.log("Diagnostic session signed out.");
  }
}

main().catch((error: unknown) => {
  console.error("Intake diagnosis could not complete. Check connectivity and public configuration.");
  let diagnostic = error instanceof Error ? error.message : "Unknown failure";
  for (const [name, value] of Object.entries(process.env)) {
    if (/password|secret|key|token/i.test(name) && value) diagnostic = diagnostic.split(value).join("[REDACTED]");
  }
  console.error(diagnostic.slice(0, 400));
  process.exitCode = 1;
});
