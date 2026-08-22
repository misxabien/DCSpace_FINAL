import type { SessionUser } from "@/lib/auth/types";
import { isAdminRole, normalizeSessionRole } from "@/lib/auth/types";
import { isOrganizerProfile } from "@/lib/organize-access";

/** Build a shared cookie session from Mongo profile fields or demo data. */
export function toSessionUser(input: {
  email: string;
  name: string;
  role?: string | null;
  organizationRole?: string | null;
}): SessionUser {
  const role = normalizeSessionRole(input.role);
  const isAdmin = isAdminRole(role);
  const isOrganizer =
    !isAdmin &&
    (role === "organizer" ||
      isOrganizerProfile({
        role: input.role,
        organizationRole: input.organizationRole,
      }));

  return {
    email: input.email.trim().toLowerCase(),
    name: input.name.trim() || (isAdmin ? "Admin" : "Student"),
    role: isOrganizer && role === "student" ? "organizer" : role,
    isOrganizer,
    isAdmin,
  };
}
