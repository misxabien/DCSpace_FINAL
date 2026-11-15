import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";

/**
 * Admin "System Permissions" a Super Admin can grant or withhold
 * (keys match the checklist labels on the Super Admin user page).
 * An admin with no saved permissions keeps full access, so existing
 * admin accounts keep working until a Super Admin restricts them.
 */
export const ADMIN_PERMISSION_KEYS = [
  "view-events",
  "approve-events",
  "reject-events",
  "request-revisions",
  "view-users",
  "view-student-users",
  "view-faculty-users",
  "add-users-manually",
  "update-user-information",
  "suspend-accounts",
  "delete-accounts",
  "view-attendance",
  "view-participants-list",
  "view-certificates",
  "review-certificates",
  "generate-certificates",
  "distribute-certificates",
  "view-feedback",
  "view-reports",
  "generate-reports",
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];

const KNOWN = new Set<string>(ADMIN_PERMISSION_KEYS);

/** "Add Users manually" → "add-users-manually" (matches checklist labels). */
export function adminPermissionKeyFromLabel(label: string): string {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Keep only known keys with boolean values. */
export function sanitizeAdminPermissions(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = adminPermissionKeyFromLabel(key);
    if (KNOWN.has(normalized) && typeof value === "boolean") out[normalized] = value;
  }
  return out;
}

type AdminSession = { session: { role: string; email: string }; userId?: string };

/**
 * Check one admin permission against the live MongoDB record.
 * Super Admins always pass; unset permissions default to allowed.
 */
export async function requireAdminPermission(
  auth: AdminSession,
  key: AdminPermissionKey,
): Promise<{ error: string; status: number } | null> {
  if (auth.session.role === "super-admin") return null;
  const db = await getUserDb();
  const filter =
    auth.userId && ObjectId.isValid(auth.userId)
      ? { _id: new ObjectId(auth.userId) }
      : { email: auth.session.email.trim().toLowerCase() };
  const user = await db.collection("users").findOne(filter, { projection: { adminPermissions: 1 } });
  const perms = (user?.adminPermissions || null) as Record<string, boolean> | null;
  if (perms && perms[key] === false) {
    return {
      error: "Your administrator account does not have permission for this action.",
      status: 403,
    };
  }
  return null;
}
