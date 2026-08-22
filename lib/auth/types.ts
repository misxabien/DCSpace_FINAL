export type Role =
  | "student"
  | "organizer"
  | "faculty"
  | "admin"
  | "super-admin";

export type SessionUser = {
  email: string;
  name: string;
  role: Role;
  isOrganizer: boolean;
  isAdmin: boolean;
};

export const SESSION_COOKIE = "dc_space_session";

export const ADMIN_ROLES: Role[] = ["admin", "super-admin"];

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super-admin";
}

export function normalizeSessionRole(role: string | null | undefined): Role {
  switch (role) {
    case "organizer":
    case "faculty":
    case "admin":
    case "super-admin":
    case "student":
      return role;
    default:
      return "student";
  }
}
