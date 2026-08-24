import { toSessionUser } from "@/lib/auth/toSessionUser";
import type { SessionUser } from "@/lib/auth/types";
import { readAuthSession } from "@/lib/user-api";

/** Instant auth hydrate from localStorage on reload (before /api/auth/me). */
export function readCachedAuthUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const session = readAuthSession();
  if (!session?.user?.email) return null;

  const profile = session.user;
  return toSessionUser({
    email: profile.email,
    name:
      profile.fullName ||
      `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
      profile.email,
    role: profile.role,
    organizationRole: profile.organizationRole,
  });
}
