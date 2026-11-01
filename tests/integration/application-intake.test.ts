import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { INTAKE_DOCUMENTS, intakeToday } from "../../lib/application-intake";
import type { Database } from "../../types/database";

test("real Auth/PostgREST concurrent retries commit one application and unique independent references", async () => {
  assert.equal(process.env.SEVASATHI_TEST_DEMO_PROJECT, "true");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "Run only against disposable local Supabase.");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, options);
  const officer = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);
  const applicant = `Fictional concurrent intake ${randomUUID()}`;
  try {
    const login = await officer.auth.signInWithPassword({ email: "operator@sevasathi.example.com", password: process.env.DEMO_OPERATOR_PASSWORD! });
    assert.equal(login.error, null, "Normal test operator must authenticate.");
    const payload = {
      request_id: randomUUID(), applicant_name: applicant, village: "Fictional concurrency village",
      annual_income: 48000.50, purpose: "Local concurrent intake verification",
      application_date: intakeToday(), certificate_type: "INCOME",
      documents: INTAKE_DOCUMENTS.map(({ key }) => ({ key, status: "MISSING" })), notes: "Atomic concurrency note",
    };
    const requests = await Promise.all(Array.from({ length: 5 }, () => officer.rpc("create_application", payload)));
    for (const response of requests) assert.equal(response.error, null, "Every retry must resolve successfully.");
    const receipts = requests.map((response) => response.data as { application_id: string; reference_number: string; duplicate: boolean });
    assert.equal(new Set(receipts.map((receipt) => receipt.application_id)).size, 1);
    assert.equal(receipts.filter((receipt) => !receipt.duplicate).length, 1);
    const other = await officer.rpc("create_application", { ...payload, request_id: randomUUID() });
    assert.equal(other.error, null);
    assert.notEqual((other.data as { reference_number: string }).reference_number, receipts[0].reference_number);
    const rows = await officer.from("applications").select("id,workflow_stage,processing_status").eq("applicant_name", applicant);
    assert.equal(rows.error, null);
    assert.equal(rows.data!.length, 2);
    for (const row of rows.data!) {
      assert.equal(row.workflow_stage, "DOCUMENT_SCREENING");
      assert.equal(row.processing_status, "PENDING");
      const history = await officer.from("application_events").select("event_type").eq("application_id", row.id);
      assert.equal(history.error, null);
      assert.deepEqual(history.data, [{ event_type: "APPLICATION_CREATED" }]);
      const notes = await officer.from("application_notes").select("body").eq("application_id", row.id);
      assert.equal(notes.error, null);
      assert.deepEqual(notes.data, [{ body: "Atomic concurrency note" }]);
    }
    const changed = await officer.rpc("create_application", { ...payload, notes: "Changed committed payload" });
    assert.equal(changed.error?.message, "INTAKE_REQUEST_REUSED");
  } finally {
    const cleanup = await admin.from("applications").delete().eq("applicant_name", applicant).eq("purpose", "Local concurrent intake verification");
    assert.equal(cleanup.error, null, "Remove only this test's unique fixtures.");
    await officer.auth.signOut({ scope: "local" });
  }
});
