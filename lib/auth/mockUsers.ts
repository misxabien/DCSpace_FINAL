import type { Role, SessionUser } from "@/lib/auth/types";
import { isAdminRole } from "@/lib/auth/types";

type MockAccount = {
  email: string;
  password: string;
  name: string;
  role: Role;
};

/** Demo SDCA accounts shared by student + admin portals. */
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
  {
    email: "admin@sdca.edu.ph",
    password: "password",
    name: "Casey Admin",
    role: "admin",
  },
  {
    email: "superadmin@sdca.edu.ph",
    password: "password",
    name: "Riley Super Admin",
    role: "super-admin",
  },
];

export const ORGANIZER_DEMO_HINT =
  "Demo: organizer@sdca.edu.ph or student.organizer@sdca.edu.ph (password: password). Registered school accounts use your DC Space password.";

export const ADMIN_DEMO_HINT =
  "Demo: admin@sdca.edu.ph (Admin) or superadmin@sdca.edu.ph (Super Admin). Password: password.";

function toUser(account: MockAccount): SessionUser {
  const isAdmin = isAdminRole(account.role);
  return {
    email: account.email,
    name: account.name,
    role: account.role,
    isOrganizer: account.role === "organizer" || account.role === "faculty",
    isAdmin,
  };
}

/** Only the explicit demo accounts — never invent a session for arbitrary emails. */
export function authenticateKnownMockAccount(
  email: string,
  password: string,
): SessionUser | null {
  const normalized = email.trim().toLowerCase();
  const known = MOCK_ACCOUNTS.find((a) => a.email === normalized);
  if (!known || known.password !== password) return null;
  return toUser(known);
}

/**
 * @deprecated Prefer authenticateKnownMockAccount — the old catch-all let any
 * @sdca.edu.ph email sign in without checking MongoDB.
 */
export function authenticate(email: string, password: string): SessionUser | null {
  return authenticateKnownMockAccount(email, password);
}
