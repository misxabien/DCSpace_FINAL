import type { Role, SessionUser } from "@/lib/auth/types";

type MockAccount = {
  email: string;
  password: string;
  name: string;
  role: Role;
};

/** Demo SDCA accounts — organizers are approved student organizers. */
export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    email: "organizer@sdca.edu.ph",
    password: "password",
    name: "Alex Organizer",
    role: "organizer",
  },
  {
    email: "student.organizer@sdca.edu.ph",
    password: "password",
    name: "Jordan Reyes",
    role: "organizer",
  },
  {
    email: "student@sdca.edu.ph",
    password: "password",
    name: "Sam Student",
    role: "student",
  },
];

export const ORGANIZER_DEMO_HINT =
  "Demo: organizer@sdca.edu.ph or student.organizer@sdca.edu.ph (password: password). Any other @sdca.edu.ph email signs in as a student.";

function isSdcaEmail(email: string) {
  return email.endsWith("@sdca.edu.ph") || email.endsWith("@sdca.edu");
}

function toUser(account: MockAccount): SessionUser {
  return {
    email: account.email,
    name: account.name,
    role: account.role,
    isOrganizer: account.role === "organizer",
  };
}

/** Resolve a session user from email + password (mock auth). */
export function authenticate(email: string, password: string): SessionUser | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const known = MOCK_ACCOUNTS.find((a) => a.email === normalized);
  if (known) {
    if (known.password !== password) return null;
    return toUser(known);
  }

  // Any other school email → student (prototype convenience)
  if (!isSdcaEmail(normalized)) return null;
  if (!password) return null;

  const local = normalized.split("@")[0] || "student";
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    email: normalized,
    name: name || "SDCA Student",
    role: "student",
    isOrganizer: false,
  };
}
