import { ROLES, type Role } from "../lib/roles";

export type DemoPasswordEnvironment = `DEMO_${Role}_PASSWORD`;
export type DemoUserDefinition = {
  role: Role;
  email: string;
  name: string;
  passwordEnv: DemoPasswordEnvironment;
};

// Configuration must fail before consumers read passwords or perform Admin API writes.
// Errors deliberately omit user-supplied values, which could be pasted credentials.
export function assertDemoUserDefinitions(
  users: unknown,
): asserts users is readonly DemoUserDefinition[] {
  function invalid(): never {
    throw new Error("Invalid demo account configuration. Use one distinct account per role and its role-specific password environment variable.");
  }
  if (!Array.isArray(users) || users.length !== ROLES.length) invalid();
  const roles = new Set<Role>();
  const emails = new Set<string>();
  for (const value of users) {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    const user = value as Record<string, unknown>;
    if (typeof user.role !== "string" || !ROLES.includes(user.role as Role)) invalid();
    const role = user.role as Role;
    if (
      roles.has(role) ||
      typeof user.email !== "string" ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user.email.trim()) ||
      typeof user.name !== "string" || !user.name.trim() ||
      user.passwordEnv !== `DEMO_${role}_PASSWORD`
    ) invalid();
    const email = user.email.trim().toLowerCase();
    if (emails.has(email)) invalid();
    roles.add(role);
    emails.add(email);
  }
}

export const DEMO_USERS = [
  {
    role: "OPERATOR",
    email: "operator@sevasathi.example.com",
    name: "ಮಾದರಿ ನಿರ್ವಾಹಕರು",
    passwordEnv: "DEMO_OPERATOR_PASSWORD",
  },
  {
    role: "FIELD_OFFICER",
    email: "field.officer@sevasathi.example.com",
    name: "ಮಾದರಿ ಕ್ಷೇತ್ರ ಅಧಿಕಾರಿ",
    passwordEnv: "DEMO_FIELD_OFFICER_PASSWORD",
  },
  {
    role: "CASEWORKER",
    email: "caseworker@sevasathi.example.com",
    name: "ಮಾದರಿ ಪ್ರಕರಣ ಪರಿಶೀಲಕರು",
    passwordEnv: "DEMO_CASEWORKER_PASSWORD",
  },
  {
    role: "APPROVING_OFFICER",
    email: "approving.officer@sevasathi.example.com",
    name: "ಮಾದರಿ ಅನುಮೋದನಾ ಅಧಿಕಾರಿ",
    passwordEnv: "DEMO_APPROVING_OFFICER_PASSWORD",
  },
] as const satisfies readonly DemoUserDefinition[];

assertDemoUserDefinitions(DEMO_USERS);

export const DEMO_JURISDICTION = { district: "ಮೈಸೂರು", taluk: "ಮೈಸೂರು" };
