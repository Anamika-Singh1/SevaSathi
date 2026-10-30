export const ROLES = [
  "OPERATOR",
  "FIELD_OFFICER",
  "CASEWORKER",
  "APPROVING_OFFICER",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, { kn: string; en: string }> = {
  OPERATOR: { kn: "ದತ್ತಾಂಶ ನಿರ್ವಾಹಕರು", en: "Operator" },
  FIELD_OFFICER: { kn: "ಕ್ಷೇತ್ರ ಅಧಿಕಾರಿಗಳು", en: "Field officer" },
  CASEWORKER: { kn: "ಪ್ರಕರಣ ಪರಿಶೀಲಕರು", en: "Caseworker" },
  APPROVING_OFFICER: { kn: "ಅನುಮೋದನಾ ಅಧಿಕಾರಿಗಳು", en: "Approving officer" },
};

export const PROTECTED_ROUTES = [
  "/dashboard",
  "/applications",
  "/field-work",
  "/reviews",
  "/decisions",
  "/settings",
] as const;

export function isProtectedPath(path: string) {
  return PROTECTED_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}

export function canAccessPath(role: Role, path: string): boolean {
  if (path === "/field-work" || path.startsWith("/field-work/"))
    return role === "FIELD_OFFICER";
  if (path === "/reviews" || path.startsWith("/reviews/"))
    return role === "CASEWORKER";
  if (path === "/decisions" || path.startsWith("/decisions/"))
    return role === "APPROVING_OFFICER";
  return isProtectedPath(path);
}

export function safeNextPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/dashboard";
  const url = new URL(value, "http://localhost");
  return isProtectedPath(url.pathname)
    ? `${url.pathname}${url.search}`
    : "/dashboard";
}
