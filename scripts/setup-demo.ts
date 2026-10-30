import { createClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import { DEMO_USERS, DEMO_JURISDICTION } from "./demo-users";
import type { Database } from "@/types/database";

async function main() {
  const config = z
    .object({
      NEXT_PUBLIC_SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(20),
    })
    .safeParse(process.env);
  if (!config.success)
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SECRET_KEY in .env.local.",
    );
  const passwords = DEMO_USERS.map((user) => {
    const value = process.env[user.passwordEnv];
    if (!value || value.length < 12 || value.length > 128)
      throw new Error(
        `Set ${user.passwordEnv} to a password between 12 and 128 characters.`,
      );
    return value;
  });
  if (new Set(passwords).size !== DEMO_USERS.length)
    throw new Error("Use four distinct demo passwords.");
  const admin = createClient<Database>(
    config.data.NEXT_PUBLIC_SUPABASE_URL,
    config.data.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  // Fail before creating Auth users when the schema/seed has not been applied.
  const { count, error: schemaError } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true)
    .like("reference_number", "SS-2026-%");
  if (schemaError || count !== 12)
    throw new Error(
      "Apply the Phase 1 migration and seed.sql first; expected exactly 12 demo applications.",
    );

  const existing = new Map<string, User>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error)
      throw new Error(
        "Cannot list Auth users. Check the server-only secret key.",
      );
    for (const user of data.users)
      if (user.email) existing.set(user.email.toLowerCase(), user);
    if (data.users.length < 100) break;
  }
  // Do not take over a pre-existing non-demo account with a colliding address.
  for (const definition of DEMO_USERS) {
    const user = existing.get(definition.email);
    if (user && user.app_metadata?.sevasathi_demo !== true)
      throw new Error(
        `Refusing to modify an existing non-demo account: ${definition.email}`,
      );
  }

  const ids = new Map<string, string>();
  for (const [index, definition] of DEMO_USERS.entries()) {
    const found = existing.get(definition.email);
    const attributes = {
      password: passwords[index],
      email_confirm: true,
      app_metadata: { sevasathi_demo: true },
      user_metadata: { full_name: definition.name },
    };
    const { data, error } = found
      ? await admin.auth.admin.updateUserById(found.id, attributes)
      : await admin.auth.admin.createUser({
          email: definition.email,
          ...attributes,
        });
    if (error || !data.user)
      throw new Error(
        `Unable to provision ${definition.role}; inspect Supabase Auth configuration and password policy.`,
      );
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        full_name: definition.name,
        role: definition.role,
        ...DEMO_JURISDICTION,
        is_active: true,
      },
      { onConflict: "id" },
    );
    if (profileError)
      throw new Error(
        `Cannot provision profile for ${definition.role}. Apply migrations first.`,
      );
    ids.set(definition.role, data.user.id);
    console.log(
      `Ready: ${definition.role} (${definition.email}). Password supplied through ${definition.passwordEnv}.`,
    );
  }

  // Exact fixture IDs prevent touching real or unrelated records. Only the three
  // field-verification examples are assigned to the demo field officer.
  for (let n = 1; n <= 12; n++) {
    const { error } = await admin
      .from("applications")
      .update({
        created_by: ids.get("OPERATOR")!,
        assigned_field_officer_id:
          n >= 4 && n <= 6 ? ids.get("FIELD_OFFICER")! : null,
      })
      .eq("id", `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`)
      .eq("is_demo", true);
    if (error)
      throw new Error(
        "Unable to assign demo applications. Check migration and jurisdiction.",
      );
    const { error: workflowError } = await admin
      .from("application_workflow")
      .update({
        operator_id: ids.get("OPERATOR")!,
        caseworker_id: ids.get("CASEWORKER")!,
        approving_officer_id: ids.get("APPROVING_OFFICER")!,
      })
      .eq(
        "application_id",
        `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      );
    if (workflowError)
      throw new Error(
        "Apply the Phase 3 migration before provisioning workflow assignments.",
      );
  }
  console.log(
    "Demo setup complete: four officers, 12 fictional applications, three field assignments. Re-running is safe.",
  );
}

main().catch((error: unknown) => {
  // Never print SDK request objects, environment values, tokens, or passwords.
  console.error(error instanceof Error ? error.message : "Demo setup failed.");
  process.exitCode = 1;
});
