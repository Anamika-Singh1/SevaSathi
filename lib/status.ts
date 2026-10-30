import type { ApplicationStatus } from "@/types/domain";

export const STATUS: Record<
  ApplicationStatus,
  { kn: string; en: string; tone: string }
> = {
  SUBMITTED: {
    kn: "ದಾಖಲೆ ಪರಿಶೀಲನೆ",
    en: "Document screening",
    tone: "bg-sky-50 text-sky-800 ring-sky-200",
  },
  FIELD_VERIFICATION: {
    kn: "ಕ್ಷೇತ್ರ ಪರಿಶೀಲನೆ",
    en: "Field verification",
    tone: "bg-amber-50 text-amber-900 ring-amber-200",
  },
  UNDER_REVIEW: {
    kn: "ಪ್ರಕರಣ ಪರಿಶೀಲನೆ",
    en: "Caseworker review",
    tone: "bg-violet-50 text-violet-800 ring-violet-200",
  },
  PENDING_APPROVAL: {
    kn: "ಅಂತಿಮ ನಿರ್ಧಾರ",
    en: "Final decision",
    tone: "bg-orange-50 text-orange-800 ring-orange-200",
  },
  APPROVED: {
    kn: "ಅನುಮೋದಿಸಲಾಗಿದೆ",
    en: "Approved",
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  REJECTED: {
    kn: "ತಿರಸ್ಕೃತ",
    en: "Rejected",
    tone: "bg-rose-50 text-rose-800 ring-rose-200",
  },
};
