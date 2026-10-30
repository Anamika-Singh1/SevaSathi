import { z } from "zod";
import { createTranslator, type Language, type MessageKey } from "@/lib/i18n";
import type {
  Application,
  ApplicationStatus,
  ApplicationWorkflow,
  Profile,
} from "@/types/domain";
import type { Role } from "@/lib/roles";

export const STAGES = {
  SUBMITTED: {
    kn: "ದಾಖಲೆ ಪರಿಶೀಲನೆ",
    en: "Document screening",
    role: "OPERATOR",
  },
  FIELD_VERIFICATION: {
    kn: "ಕ್ಷೇತ್ರ ಪರಿಶೀಲನೆ",
    en: "Field verification",
    role: "FIELD_OFFICER",
  },
  UNDER_REVIEW: {
    kn: "ಪ್ರಕರಣ ಪರಿಶೀಲನೆ",
    en: "Caseworker review",
    role: "CASEWORKER",
  },
  PENDING_APPROVAL: {
    kn: "ಅಂತಿಮ ನಿರ್ಧಾರ",
    en: "Final decision",
    role: "APPROVING_OFFICER",
  },
} as const;
export const RECEIPT_STATUS = {
  RECEIVED: "Received",
  MISSING: "Missing",
  CLARIFICATION_NEEDED: "Clarification needed",
} as const;
export const VERIFICATION_CHECKS = {
  identity_confirmed: "Applicant identity confirmed",
  residence_confirmed: "Residence verified",
  income_assessed: "Declared income assessed",
} as const;
export const REVIEW_CHECKS = {
  documents_reviewed: "Document checklist reviewed",
  field_report_reviewed: "Field report reviewed",
  income_reviewed: "Income details reviewed",
} as const;
export const VERIFICATION_STATUS = {
  PENDING: "Verification pending",
  VERIFIED: "Verified",
  NEEDS_CLARIFICATION: "Needs clarification",
  UNABLE_TO_VERIFY: "Unable to verify",
} as const;
export const workflowActionSchema = z.enum([
  "SAVE",
  "ADVANCE",
  "RETURN",
  "RESUME",
  "APPROVE",
  "REJECT",
]);
export type WorkflowAction = z.infer<typeof workflowActionSchema>;
const reason = z.string().trim().max(4000).default("");
const officer = z.union([z.uuid(), z.literal("")]);
export const screeningSchema = z
  .object({
    screening_notes: z.string().trim().max(4000),
    checklist: z
      .array(
        z
          .object({
            key: z.string().min(1).max(100),
            status: z.enum(["RECEIVED", "MISSING", "CLARIFICATION_NEEDED"]),
            note: z.string().max(1000),
          })
          .strict(),
      )
      .max(100),
    field_officer_id: officer,
    caseworker_id: officer,
    approving_officer_id: officer,
    reason,
    confirmed: z.boolean(),
  })
  .strict();
export const fieldSchema = z
  .object({
    visit_date: z.union([z.iso.date(), z.literal("")]),
    field_observations: z.string().trim().max(4000),
    verification_status: z
      .enum(["PENDING", "VERIFIED", "NEEDS_CLARIFICATION", "UNABLE_TO_VERIFY"])
      .default("PENDING"),
    follow_up_questions: z.string().trim().max(4000).default(""),
    follow_up_resolved: z.boolean().default(false),
    verification_checks: z
      .object({
        identity_confirmed: z.boolean(),
        residence_confirmed: z.boolean(),
        income_assessed: z.boolean(),
      })
      .strict(),
    reason,
    confirmed: z.boolean(),
  })
  .strict();
export const reviewSchema = z
  .object({
    caseworker_notes: z.string().trim().max(4000),
    review_issues: z.string().trim().max(4000).default(""),
    review_issues_resolved: z.boolean().default(false),
    review_checks: z
      .object({
        documents_reviewed: z.boolean(),
        field_report_reviewed: z.boolean(),
        income_reviewed: z.boolean(),
      })
      .strict(),
    reason,
    confirmed: z.boolean(),
  })
  .strict();
export const decisionSchema = z
  .object({ reason, confirmed: z.boolean() })
  .strict();
export const payloadSchemaFor = (role: Role) =>
  ({
    OPERATOR: screeningSchema,
    FIELD_OFFICER: fieldSchema,
    CASEWORKER: reviewSchema,
    APPROVING_OFFICER: decisionSchema,
  })[role];

export function assignedActorId(
  application: Application,
  workflow: ApplicationWorkflow,
) {
  switch (application.status) {
    case "SUBMITTED":
      return workflow.operator_id;
    case "FIELD_VERIFICATION":
      return application.assigned_field_officer_id;
    case "UNDER_REVIEW":
      return workflow.caseworker_id;
    case "PENDING_APPROVAL":
      return workflow.approving_officer_id;
    default:
      return null;
  }
}
export function canWork(
  application: Application,
  workflow: ApplicationWorkflow,
  profile: Pick<Profile, "id" | "role">,
) {
  const stage = STAGES[application.status as keyof typeof STAGES];
  return (
    !!stage &&
    stage.role === profile.role &&
    assignedActorId(application, workflow) === profile.id
  );
}
export function stageLabel(status: ApplicationStatus, locale: Language = "kn") {
  return (
    STAGES[status as keyof typeof STAGES]?.[locale] ??
    createTranslator(locale)(status === "APPROVED" ? "Approved" : "Rejected")
  );
}
export function workflowErrorMessage(code: string, locale: Language = "kn") {
  const messages: Record<string, MessageKey> = {
    WORKFLOW_STALE:
      "This case changed. Reload before saving; your entry is retained here.",
    WORKFLOW_NOT_ASSIGNED: "You are not the assigned officer for this stage.",
    WORKFLOW_FORBIDDEN: "You are not authorized for this application.",
    WORKFLOW_CLOSED: "The final decision is locked.",
    WORKFLOW_SCREENING_INCOMPLETE:
      "Receive all required documents, add screening notes, and assign the field officer, caseworker and approving officer.",
    WORKFLOW_FIELD_INCOMPLETE:
      "Complete screening first, record a visit between submission and today, add observations, and complete all checks.",
    WORKFLOW_FIELD_UNRESOLVED:
      "Mark verification as Verified and resolve all follow-up questions before submitting.",
    WORKFLOW_REVIEW_UNRESOLVED:
      "Resolve the review issues or return the case for clarification.",
    WORKFLOW_REVIEW_INCOMPLETE:
      "Complete prior submissions, review notes and all review checks.",
    WORKFLOW_REASON_REQUIRED:
      "Provide a reason or resolution of at least 5 characters.",
    WORKFLOW_CONFIRM_REQUIRED: "Confirm this decision before submitting.",
    WORKFLOW_INVALID_ASSIGNMENT: "Select active officers in this jurisdiction.",
    WORKFLOW_RESUME_REQUIRED: "Resolve the clarification and use Resume.",
    WORKFLOW_REQUEST_REUSED: "Reload before submitting a changed request.",
  };
  return createTranslator(locale)(
    messages[code] ??
      "Unable to save. Your entries are retained. Retry; a committed request will not be duplicated.",
  );
}
