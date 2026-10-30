import { createTranslator, type Language, type MessageKey } from "./index";

const eventMessages: Record<string, MessageKey> = {
  APPLICATION_CREATED: "Application registered",
  STAGE_CHANGED: "Stage changed",
  OFFICER_ASSIGNED: "Officer assigned",
  CHECKLIST_CHANGED: "Checklist changed",
  SCREENING_SAVED: "Screening progress saved",
  DOCUMENT_SCREENED: "Document screening completed",
  FIELD_DRAFT_SAVED: "Field draft saved",
  FIELD_REPORT_SUBMITTED: "Field report submitted",
  CASEWORKER_REVIEW_SAVED: "Review progress saved",
  CASEWORKER_REVIEWED: "Caseworker review completed",
  RETURNED_FOR_CLARIFICATION: "Returned for clarification",
  APPLICATION_RESUMED: "Application resumed",
  APPROVED: "Application approved",
  REJECTED: "Application rejected",
};
export function certificateLabel(value: string, locale: Language) {
  return [
    "Income certificate",
    "Income Certificate",
    "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ",
    "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ / Income certificate",
  ].includes(value)
    ? createTranslator(locale)("Income certificate")
    : value;
}
export function eventLabel(type: string, locale: Language) {
  return createTranslator(locale)(eventMessages[type] ?? "Application updated");
}
// Match the view's defined messages; never split or translate arbitrary case notes.
export function priorityReason(reason: string, locale: Language) {
  const t = createTranslator(locale);
  const numeric: [RegExp, MessageKey][] = [
    [
      /^(\d+) ದಿನ ಗುರಿ ಮೀರಿದೆ \/ day\(s\) past demo target$/,
      "{count} days past demo target",
    ],
    [
      /^(\d+) ದಿನ ಈ ಹಂತದಲ್ಲಿ ಬಾಕಿ \/ day\(s\) waiting in this stage$/,
      "{count} days waiting in this stage",
    ],
    [
      /^(\d+) ಬಾಕಿ ಕ್ರಮಗಳು \/ unresolved action\(s\)$/,
      "{count} unresolved actions",
    ],
  ];
  for (const [pattern, key] of numeric) {
    const match = reason.match(pattern);
    if (match) return t(key, { count: match[1] });
  }
  const fixed: Record<string, MessageKey> = {
    "ಪ್ರಕ್ರಿಯೆ ಪೂರ್ಣಗೊಂಡಿದೆ / Processing completed": "Processing completed",
    "ಗುರಿ ದಿನಾಂಕ ಸಮೀಪಿಸಿದೆ / Demo target approaching":
      "Demo target approaching",
    "ಸಾಮಾನ್ಯ ಸರತಿ / Within demo thresholds": "Within demo thresholds",
  };
  return fixed[reason] ? t(fixed[reason]) : reason;
}
