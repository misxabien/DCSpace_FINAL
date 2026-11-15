/** Role given to self-registered admins until a Super Admin approves them. */
export const PENDING_ADMIN_ROLE = "admin-pending";

type AccountFields = {
  role?: unknown;
  suspended?: unknown;
  [key: string]: unknown;
};

/**
 * Returns a user-facing reason when an account may not sign in or use the
 * API, or null when the account is usable.
 */
export function accountBlockReason(user: AccountFields | null | undefined): string | null {
  if (!user) return null;
  if (user.suspended === true) {
    return "This account is suspended. Contact a DC Space administrator.";
  }
  if (String(user.role || "") === PENDING_ADMIN_ROLE) {
    return "Your admin account is waiting for Super Admin approval.";
  }
  return null;
}
