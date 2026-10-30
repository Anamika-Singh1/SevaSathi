import type {
  Application,
  ApplicationWorkflow,
  ChecklistItem,
} from "@/types/domain";
import type { AiFeature, AiRequest } from "./contracts";

export type AiCase = {
  application: Pick<
    Application,
    | "id"
    | "certificate_type"
    | "annual_income"
    | "purpose"
    | "status"
    | "assigned_field_officer_id"
    | "updated_at"
  >;
  workflow: ApplicationWorkflow;
  checklist: Pick<
    ChecklistItem,
    "label_kn" | "label_en" | "required" | "receipt_status" | "note"
  >[];
};

// Explicit stage projections keep names, locations, identifiers, file paths,
// authentication data, officer identities and the full audit log out of Gemini.
export function buildAiContext(
  feature: AiFeature,
  record: AiCase,
  input: AiRequest,
): Record<string, unknown> {
  const { application: a, workflow: w } = record;
  const field = {
    visit_date: w.visit_date,
    observations: w.field_observations,
    verification_checks: w.verification_checks,
    verification_status: w.verification_status,
    follow_up_questions: w.follow_up_questions,
    follow_up_resolved: w.follow_up_resolved,
    report_submitted_at: w.field_submitted_at,
  };
  if (feature === "field") return { field };
  const screening = {
    checklist: record.checklist.map((item) => ({
      item: input.language === "kn" ? item.label_kn : item.label_en,
      required: item.required,
      status: item.receipt_status,
      note: item.note,
    })),
    required_items: record.checklist.filter((item) => item.required).length,
    required_received: record.checklist.filter(
      (item) => item.required && item.receipt_status === "RECEIVED",
    ).length,
    notes: w.screening_notes,
  };
  const application = {
    certificate_type: a.certificate_type,
    declared_annual_income: a.annual_income,
    purpose: a.purpose,
  };
  if (feature === "screening") return { application, screening };
  const review = {
    notes: w.caseworker_notes,
    evidence_checks: w.review_checks,
    issues: w.review_issues,
    issues_resolved: w.review_issues_resolved,
    submitted_at: w.review_submitted_at,
  };
  const clarification = {
    pending: w.clarification_pending,
    recorded_reason: w.return_reason,
  };
  const context = { application, screening, field, review, clarification };
  if (feature === "review") return context;
  const closed = ["APPROVED", "REJECTED"].includes(a.status);
  return {
    ...context,
    human_decision: {
      action: closed
        ? a.status === "APPROVED"
          ? "APPROVE"
          : "REJECT"
        : (input.humanAction ?? null),
      rationale: closed ? w.decision_reason : (input.rationale ?? null),
      recorded_at: w.decided_at,
      officially_recorded: closed,
    },
  };
}
