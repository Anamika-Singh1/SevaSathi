import { z } from "zod";
import type { Role } from "@/lib/roles";
import type { ApplicationStatus, ApplicationWorkflow } from "@/types/domain";

export const AI_FEATURES = {
  screening: {
    role: "OPERATOR",
    stage: "SUBMITTED",
    kn: "ದಾಖಲೆ ಪರಿಶೀಲನಾ ಸಹಾಯ",
    en: "Document screening assistant",
  },
  field: {
    role: "FIELD_OFFICER",
    stage: "FIELD_VERIFICATION",
    kn: "ಕ್ಷೇತ್ರ ಪರಿಶೀಲನಾ ಸಹಾಯ",
    en: "Field verification assistant",
  },
  review: {
    role: "CASEWORKER",
    stage: "UNDER_REVIEW",
    kn: "ಪ್ರಕರಣ ಪರಿಶೀಲನಾ ಸಹಾಯ",
    en: "Caseworker review assistant",
  },
  decision: {
    role: "APPROVING_OFFICER",
    stage: "PENDING_APPROVAL",
    kn: "ನಿರ್ಧಾರ ಟಿಪ್ಪಣಿ ಸಹಾಯ",
    en: "Decision note assistant",
  },
} as const;
export const aiFeatureSchema = z.enum([
  "screening",
  "field",
  "review",
  "decision",
]);
export type AiFeature = z.infer<typeof aiFeatureSchema>;
export const aiRequestSchema = z
  .object({
    version: z.number().int().min(0).max(2147483647),
    language: z.enum(["kn", "en"]).default("kn"),
    humanAction: z.enum(["APPROVE", "REJECT", "RETURN"]).nullable().optional(),
    rationale: z.string().trim().max(1000).optional(),
  })
  .strict();
export type AiRequest = z.infer<typeof aiRequestSchema>;
const items = z.array(z.string().trim().min(1).max(600)).max(16);
export const aiSuggestionsSchema = z
  .object({
    language: z.enum(["kn", "en"]),
    summary: z.string().trim().min(1).max(2400),
    evidence: items,
    missingInformation: items,
    questionsToVerify: items,
    inconsistencies: items,
    unverifiedInformation: items,
    draft: z.string().trim().min(1).max(6000),
  })
  .strict();
export type AiSuggestions = z.infer<typeof aiSuggestionsSchema>;
export const aiSuccessSchema = z
  .object({
    ok: z.literal(true),
    feature: aiFeatureSchema,
    sourceVersion: z.number().int().min(0),
    generatedAt: z.iso.datetime(),
    suggestions: aiSuggestionsSchema,
  })
  .strict();
export type AiSuccess = z.infer<typeof aiSuccessSchema>;
export const AI_VERIFICATION_NOTICE =
  "AI ಕರಡು ಮಾತ್ರ. ಉಳಿಸಿದ ದಾಖಲೆಗಳೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿ; ಅಧಿಕೃತ ನಿರ್ಧಾರವನ್ನು ಅಧಿಕಾರಿ ಮಾತ್ರ ಮಾಡಬೇಕು. / AI draft only. Verify against saved records. Only an authorized human officer may make the official decision.";

export type AiAuthorizationCase = {
  application: {
    status: ApplicationStatus;
    assigned_field_officer_id: string | null;
  };
  workflow: Pick<
    ApplicationWorkflow,
    "operator_id" | "caseworker_id" | "approving_officer_id"
  >;
};
export function canUseAi(
  feature: AiFeature,
  record: AiAuthorizationCase,
  officer: { id: string; role: Role },
) {
  const rule = AI_FEATURES[feature];
  const stageMatches =
    record.application.status === rule.stage ||
    (feature === "decision" &&
      ["APPROVED", "REJECTED"].includes(record.application.status));
  const assigned = {
    screening: record.workflow.operator_id,
    field: record.application.assigned_field_officer_id,
    review: record.workflow.caseworker_id,
    decision: record.workflow.approving_officer_id,
  }[feature];
  return officer.role === rule.role && stageMatches && assigned === officer.id;
}
export function featureForRole(role: Role): AiFeature {
  return (
    {
      OPERATOR: "screening",
      FIELD_OFFICER: "field",
      CASEWORKER: "review",
      APPROVING_OFFICER: "decision",
    } as const
  )[role];
}
