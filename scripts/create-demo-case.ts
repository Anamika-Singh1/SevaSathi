import { randomInt } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import { DEMO_USERS, DEMO_JURISDICTION } from "./demo-users";
import type { Role } from "../lib/roles";
import type { Database } from "../types/database";

class DemoCaseError extends Error {}

async function main() {
  if (process.env.SEVASATHI_TEST_DEMO_PROJECT !== "true") {
    throw new DemoCaseError(
      "Set SEVASATHI_TEST_DEMO_PROJECT=true only for a dedicated fictional demonstration project.",
    );
  }
  const parsed = z.object({
    url: z.url().refine((value) => /^https?:\/\//.test(value)),
    key: z.string().min(20),
  }).safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY,
  });
  if (!parsed.success) {
    throw new DemoCaseError("Configure the Supabase URL and server-only secret key in .env.local.");
  }
  const admin = createClient<Database>(parsed.data.url, parsed.data.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users = new Map<string, User>();
  for (let page = 1; ; page++) {
    if (page > 50) throw new DemoCaseError("Use a dedicated demo project with a bounded officer directory.");
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new DemoCaseError("Cannot inspect demo accounts. Check the server-only key and Supabase connectivity.");
    for (const user of data.users) if (user.email) users.set(user.email.toLowerCase(), user);
    if (data.users.length < 100) break;
  }
  const ids = new Map<Role, string>();
  for (const definition of DEMO_USERS) {
    const user = users.get(definition.email);
    if (!user || user.app_metadata?.sevasathi_demo !== true) {
      throw new DemoCaseError("Run npm run demo:setup to provision all four trusted fictional officer accounts first.");
    }
    ids.set(definition.role, user.id);
  }
  // The initialization trigger selects active officers in this jurisdiction.
  // Refuse an ambiguous directory before inserting any evaluation data.
  const profiles = await admin.from("profiles")
    .select("id,role,is_active,district,taluk")
    .eq("district", DEMO_JURISDICTION.district)
    .eq("taluk", DEMO_JURISDICTION.taluk)
    .eq("is_active", true);
  const activeProfiles = profiles.data;
  if (profiles.error || !activeProfiles || activeProfiles.length !== DEMO_USERS.length || DEMO_USERS.some((definition) =>
    !activeProfiles.some((profile) => profile.id === ids.get(definition.role) && profile.role === definition.role)
  )) {
    throw new DemoCaseError("Expected exactly the four provisioned active demo profiles in the demonstration jurisdiction. Check demo:setup and trusted profile assignments.");
  }
  const reference = `SS-2099-${randomInt(10000000, 100000000)}`;
  const created = await admin.from("applications").insert({
    reference_number: reference,
    applicant_name: "ಮಾದರಿ ಮೌಲ್ಯಮಾಪನ ಅರ್ಜಿದಾರರು",
    village: "ಮಾದರಿ ಮೌಲ್ಯಮಾಪನ ಗ್ರಾಮ",
    ...DEMO_JURISDICTION,
    annual_income: 48000,
    purpose: "ಕಾಲ್ಪನಿಕ ಮೌಲ್ಯಮಾಪನ / Fictional evaluator walkthrough",
    status: "SUBMITTED",
    is_demo: true,
    submitted_at: new Date().toISOString(),
    created_by: ids.get("OPERATOR")!,
    assigned_field_officer_id: ids.get("FIELD_OFFICER")!,
  }).select("id").single();
  if (created.error || !created.data) {
    throw new DemoCaseError("Unable to create a fictional case. Check migrations/connectivity, then retry; no existing application was changed.");
  }
  const id = created.data.id;
  const workflow = await admin.from("application_workflow")
    .select("operator_id,caseworker_id,approving_officer_id,version")
    .eq("application_id", id).single();
  if (workflow.error || !workflow.data || workflow.data.operator_id !== ids.get("OPERATOR") ||
    workflow.data.caseworker_id !== ids.get("CASEWORKER") ||
    workflow.data.approving_officer_id !== ids.get("APPROVING_OFFICER") || workflow.data.version !== 0) {
    throw new DemoCaseError(`Created ${reference}, but workflow initialization could not be verified. Inspect /applications/${id} before retrying. No existing application was changed.`);
  }
  console.log(`Created fictional evaluation case: ${reference}`);
  console.log(`Open with each assigned officer: /applications/${id}`);
  console.log("The case starts at document screening. No prior sign-offs or official decision were invented.");
}

main().catch((error: unknown) => {
  console.error(error instanceof DemoCaseError ? error.message : "Demo case preparation failed. Check local configuration and Supabase connectivity.");
  process.exitCode = 1;
});
