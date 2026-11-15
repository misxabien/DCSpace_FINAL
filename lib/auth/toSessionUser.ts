import type { SessionUser } from "@/lib/auth/types";
import { isAdminRole, normalizeSessionRole } from "@/lib/auth/types";
import { isOrganizerProfile } from "@/lib/organize-access";

/** Build a shared cookie session from Mongo profile fields or demo data. */
export function toSessionUser(input: {
  email: string;
  name: string;
  role?: string | null;
  organizationRole?: string | null;
  /** Admin "Admin Actions" switches; eventsOrganizedPage=false hides Events Organized. */
  permissions?: { eventsOrganizedPage?: boolean } | null;
}): SessionUser {
  const role = normalizeSessionRole(input.role);
  const isAdmin = isAdminRole(role);
  const organizerPageAllowed = input.permissions?.eventsOrganizedPage !== false;
  const isOrganizer =
    !isAdmin &&
    organizerPageAllowed &&
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
