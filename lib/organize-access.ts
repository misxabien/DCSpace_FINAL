import { readAuthSession, type UserProfile } from "@/lib/user-api";

function normalize(value: string | undefined | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/** Server-safe organizer check from profile / Mongo user fields. */
export function isOrganizerProfile(fields: {
  role?: string | null;
  organizationRole?: string | null;
}) {
  const accountRole = normalize(fields.role);
  const organizationRole = normalize(fields.organizationRole);

  if (accountRole === "faculty") {
    return true;
  }

  return (
    organizationRole === "officer" ||
    organizationRole.startsWith("officer:") ||
    organizationRole.includes("officer") ||
    organizationRole.includes("president") ||
    organizationRole.includes("secretary") ||
    organizationRole.includes("treasurer") ||
    organizationRole.includes("organizer")
  );
}

/**
 * Officers (organization role) and faculty accounts can access Events Organized.
 * Regular organization "student" members cannot.
 */
export function canOrganizeEvents(
  profile?: Pick<UserProfile, "role" | "organizationRole"> | null,
) {
  if (typeof window === "undefined" && !profile) {
    return false;
  }

  const sessionUser = profile || readAuthSession()?.user || null;
  return isOrganizerProfile({
    role:
      sessionUser?.role ||
      (typeof window !== "undefined" ? window.localStorage.getItem("dcspaceAccountType") : "") ||
      "",
    organizationRole:
      sessionUser?.organizationRole ||
      (typeof window !== "undefined"
        ? window.localStorage.getItem("dcspaceOrganizationRole")
        : "") ||
      "",
  });
}
