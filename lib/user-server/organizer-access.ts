import { isAdminRole } from "@/lib/auth/types";
import { isOrganizerProfile } from "@/lib/organize-access";
import { accountBlockReason } from "@/lib/user-server/account-status";
import { getUserDb } from "@/lib/user-server/get-user-db";

/** Per-account switches set by admins under "Admin Actions" on the user page. */
export type UserPermissions = {
  joinEvents?: boolean;
  eventsOrganizedPage?: boolean;
  createEvents?: boolean;
  editEvents?: boolean;
  inviteSomeone?: boolean;
  seeWhoAttended?: boolean;
  reviewFilesSubmitted?: boolean;
  reviewAttendanceStatus?: boolean;
};

export type PermissionKey = keyof UserPermissions;

/** Missing switches default to allowed, so existing accounts keep working. */
export function hasPermission(
  permissions: UserPermissions | null | undefined,
  key: PermissionKey,
): boolean {
  return permissions?.[key] !== false;
}

/**
 * Server-side check that the account may use an organizer feature.
 * Reads the live MongoDB record so role, suspension and admin switches
 * take effect immediately (the session cookie alone is not trusted).
 */
export async function checkOrganizerAccess(
  email: string,
  feature: PermissionKey = "eventsOrganizedPage",
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return { ok: false, error: "Authentication required.", status: 401 };

  const db = await getUserDb();
  const user = await db.collection("users").findOne(
    { email: normalized },
    { projection: { role: 1, organizationRole: 1, suspended: 1, permissions: 1 } },
  );
  if (!user) return { ok: false, error: "Account not found.", status: 403 };

  if (isAdminRole(String(user.role || ""))) return { ok: true };

  const blocked = accountBlockReason(user);
  if (blocked) return { ok: false, error: blocked, status: 403 };

  const organizer =
    String(user.role || "") === "organizer" ||
    isOrganizerProfile({
      role: String(user.role || ""),
      organizationRole: String(user.organizationRole || ""),
    });
  if (!organizer) {
    return {
      ok: false,
      error: "Only faculty and organization officers can organize events.",
      status: 403,
    };
  }

  const permissions = (user.permissions || {}) as UserPermissions;
  if (!hasPermission(permissions, "eventsOrganizedPage") || !hasPermission(permissions, feature)) {
    return {
      ok: false,
      error: "An administrator has turned off this organizer feature for your account.",
      status: 403,
    };
  }

  return { ok: true };
}
