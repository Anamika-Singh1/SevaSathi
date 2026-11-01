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
    "INCOME",
    "Income certificate",
    "Income Certificate",
    "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ",
    "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ / Income certificate",
  ].includes(value.trim())
    ? createTranslator(locale)("Income certificate")
    : value;
}

// These are labels with reviewed translations, never translations of arbitrary
// names or case evidence. Keep stored values/IDs intact for filters and writes.
export function locationLabel(value: string, locale: Language) {
  const t = createTranslator(locale);
  if (["ಮೈಸೂರು", "Mysuru", "Mysore"].includes(value)) return t("Mysuru");
  const village = value.match(/^ಮಾದರಿ ಗ್ರಾಮ ([೧೨೩೪])$/);
  if (village) {
    const number = "೧೨೩೪".indexOf(village[1]) + 1;
    return t("Demo village {number}", { number: locale === "kn" ? village[1] : number });
  }
  return value;
}

const officerMessages: Record<string, MessageKey> = {
  "ಮಾದರಿ ನಿರ್ವಾಹಕರು": "Demo operator",
  "ಮಾದರಿ ಕ್ಷೇತ್ರ ಅಧಿಕಾರಿ": "Demo field officer",
  "ಮಾದರಿ ಪ್ರಕರಣ ಪರಿಶೀಲಕರು": "Demo caseworker",
  "ಮಾದರಿ ಅನುಮೋದನಾ ಅಧಿಕಾರಿ": "Demo approving officer",
  "ಹಿಂದಿನ ಅಧಿಕಾರಿ / Historical officer": "Historical officer",
};
export function officerLabel(value: string, locale: Language) {
  return Object.hasOwn(officerMessages, value)
    ? createTranslator(locale)(officerMessages[value]) : value;
}

const documentMessages: Record<string, MessageKey> = {
  "ಆದಾಯ ಘೋಷಣೆ / Income declaration": "Income declaration",
  "ಆದಾಯ ಘೋಷಣೆ": "Income declaration",
  "Income declaration": "Income declaration",
  "ಗುರುತಿನ ದಾಖಲೆ": "Identity proof",
  "Identity proof": "Identity proof",
  "ನಿವಾಸದ ದಾಖಲೆ": "Residence proof",
  "Residence proof": "Residence proof",
};
export function documentLabel(value: string, locale: Language) {
  return Object.hasOwn(documentMessages, value)
    ? createTranslator(locale)(documentMessages[value]) : value;
}

const demoApplicants = [
  "ಮಾದರಿ ಅರ್ಜಿದಾರ ಅ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಆ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಇ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಈ",
  "ಮಾದರಿ ಅರ್ಜಿದಾರ ಉ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಊ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಋ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಎ",
  "ಮಾದರಿ ಅರ್ಜಿದಾರ ಏ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಐ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಒ", "ಮಾದರಿ ಅರ್ಜಿದಾರ ಓ",
];
export function demoApplicantSearchTerm(value: string) {
  const match = value.trim().match(/^demo applicant(?:\s+([1-9]|1[0-2]))?$/i);
  if (!match) return null;
  return match[1] ? demoApplicants[Number(match[1]) - 1] : "ಮಾದರಿ ಅರ್ಜಿದಾರ";
}
const demoMessages: Record<string, MessageKey> = {
  "ವಿದ್ಯಾರ್ಥಿವೇತನ / Scholarship": "Scholarship",
  "ಶೈಕ್ಷಣಿಕ ನೆರವು / Education support": "Education support",
  "ಸರ್ಕಾರಿ ಸೌಲಭ್ಯ / Government benefit": "Government benefit",
  "ಪ್ರಾತ್ಯಕ್ಷಿಕೆಗಾಗಿ ಮಾತ್ರ. ಎಲ್ಲಾ ವಿವರಗಳು ಕಾಲ್ಪನಿಕ. / Demo only. All details are fictional.": "Demo only. All details are fictional.",
  "ಆದಾಯ ಘೋಷಣೆ ಸ್ಪಷ್ಟೀಕರಣ ಬಾಕಿ / Income declaration clarification pending": "Income declaration clarification pending",
  "ಕ್ಷೇತ್ರ ವರದಿ ಪರಿಶೀಲಿಸಿ / Review field report": "Review field report",
  "ಆದಾಯ ದಾಖಲೆ ಹೊಂದಾಣಿಕೆ / Reconcile income record": "Reconcile income record",
  "ಕಾಲ್ಪನಿಕ ಕ್ಷೇತ್ರ ಭೇಟಿ ಪೂರ್ಣಗೊಂಡಿದೆ. ಆದಾಯ ಘೋಷಣೆ ಮತ್ತು ಗ್ರಾಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲನೆಗೆ ದಾಖಲಿಸಲಾಗಿದೆ. / Fictional field visit completed. Income declaration and village details recorded for review.": "Fictional field visit completed. Income declaration and village details recorded for review.",
};
export function demoRecordText(value: string, locale: Language, isDemo: boolean) {
  if (!isDemo) return value;
  const index = demoApplicants.indexOf(value);
  if (index >= 0) return locale === "kn" ? value
    : createTranslator(locale)("Demo applicant {number}", { number: index + 1 });
  return Object.hasOwn(demoMessages, value)
    ? createTranslator(locale)(demoMessages[value]) : value;
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
