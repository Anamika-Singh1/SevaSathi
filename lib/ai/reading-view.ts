import { z } from "zod";
import type { MessageKey } from "@/lib/i18n";
import type { Application, ApplicationWorkflow, ApplicationNote, ChecklistItem } from "@/types/domain";

export const READING_LABELS = {
  applicant_name: "Applicant name",
  village: "Village",
  district: "District",
  taluk: "Taluk",
  purpose: "Purpose",
  screening_notes: "Screening notes",
  field_observations: "Field observations",
  field_report: "Saved field report",
  caseworker_notes: "Caseworker notes",
  follow_up_questions: "Follow-up questions",
  review_issues: "Review issues",
  return_reason: "Return reason",
  decision_reason: "Decision reason",
  note: "Saved note",
  document: "Document note",
} as const satisfies Record<string, MessageKey>;
export type ReadingField = {
  key: string;
  type: keyof typeof READING_LABELS;
  original: string;
  ordinal?: number;
};
export type ReadingSource = {
  application: Pick<Application, "applicant_name" | "village" | "district" | "taluk" | "purpose" | "field_report">;
  workflow: Pick<ApplicationWorkflow, "screening_notes" | "field_observations" | "caseworker_notes" | "follow_up_questions" | "review_issues" | "return_reason" | "decision_reason">;
  notes: Pick<ApplicationNote, "id" | "body">[];
  checklist: Pick<ChecklistItem, "key" | "note">[];
};

// Project only selected readable text. Never change the source or send the full
// record, actor identities, audit history, filenames or credentials to Gemini.
export function readingFields(source: ReadingSource): ReadingField[] {
  const fields: ReadingField[] = [];
  function add(type: ReadingField["type"], original: string | null, key: string = type, ordinal?: number) {
    if (original?.trim()) fields.push({ key, type, original, ...(ordinal ? { ordinal } : {}) });
  }
  for (const type of ["applicant_name", "village", "district", "taluk", "purpose", "field_report"] as const)
    add(type, source.application[type]);
  for (const type of ["screening_notes", "field_observations", "caseworker_notes", "follow_up_questions", "review_issues", "return_reason", "decision_reason"] as const)
    add(type, source.workflow[type]);
  source.notes.forEach((note, index) => add("note", note.body, `note:${note.id}`, index + 1));
  source.checklist.forEach((item, index) => add("document", item.note, `document:${item.key}`, index + 1));
  return fields;
}

export const readingRequestSchema = z.object({
  version: z.number().int().min(0).max(2147483647),
  language: z.enum(["kn", "en"]),
  field: z.string().min(1).max(120).regex(/^[a-z_]+(?::[a-z0-9_-]+)?$/i)
    .refine(value => !value.startsWith("note:") || z.uuid().safeParse(value.slice(5)).success),
}).strict();
export type ReadingRequest = z.infer<typeof readingRequestSchema>;
export const translatedTextSchema = z.object({
  language: z.enum(["kn", "en"]),
  translation: z.string().trim().min(1).max(12000),
}).strict();
export type TranslatedText = z.infer<typeof translatedTextSchema>;
export const readingSuccessSchema = z.object({
  ok: z.literal(true),
  field: z.string().min(1).max(120),
  sourceVersion: z.number().int().min(0),
  original: z.string().min(1).max(4000),
  language: z.enum(["kn", "en"]),
  translation: z.string().min(1).max(12000),
}).strict();
export type ReadingSuccess = z.infer<typeof readingSuccessSchema>;
export type ReadingSnapshot = { version: number; updatedAt: string; fields: ReadingField[] };
