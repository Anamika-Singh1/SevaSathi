import { test } from "vitest";
import assert from "node:assert/strict";
import {
  payloadSchemaFor,
  workflowActionSchema,
  canWork,
  assignedActorId,
} from "../lib/workflow";
import type { Application, ApplicationWorkflow } from "../types/domain";

test("workflow payloads cannot contain another stage's data or forged actor fields", () => {
  assert.equal(
    payloadSchemaFor("APPROVING_OFFICER").safeParse({
      reason: "Reviewed",
      confirmed: true,
      actor_id: "forged",
    }).success,
    false,
  );
  assert.equal(
    payloadSchemaFor("FIELD_OFFICER").safeParse({
      visit_date: "2026-02-30",
      field_observations: "Report",
      verification_checks: {
        identity_confirmed: true,
        residence_confirmed: true,
        income_assessed: true,
      },
      reason: "",
      confirmed: false,
    }).success,
    false,
  );
  assert.equal(
    workflowActionSchema.safeParse("ISSUE_CERTIFICATE").success,
    false,
  );
});
test("correct role and named assignment are both required in the interface", () => {
  const application = {
    status: "FIELD_VERIFICATION",
    assigned_field_officer_id: "assigned",
  } as Application;
  const workflow = {
    operator_id: "operator",
    caseworker_id: "caseworker",
    approving_officer_id: "approver",
  } as ApplicationWorkflow;
  assert.equal(assignedActorId(application, workflow), "assigned");
  assert.equal(
    canWork(application, workflow, { id: "assigned", role: "FIELD_OFFICER" }),
    true,
  );
  assert.equal(
    canWork(application, workflow, { id: "another", role: "FIELD_OFFICER" }),
    false,
  );
  assert.equal(
    canWork(application, workflow, { id: "assigned", role: "OPERATOR" }),
    false,
  );
  assert.equal(
    canWork({ ...application, status: "APPROVED" }, workflow, {
      id: "approver",
      role: "APPROVING_OFFICER",
    }),
    false,
  );
});
