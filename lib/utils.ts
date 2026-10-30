import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { languageTag, type Language } from "@/lib/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string, language: Language = "kn") {
  return new Intl.DateTimeFormat(languageTag(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function formatCurrency(value: number, language: Language = "kn") {
  return new Intl.NumberFormat(languageTag(language), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
