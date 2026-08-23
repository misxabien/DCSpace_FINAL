import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import { decodeSession } from "@/lib/auth/session";
import { SESSION_COOKIE, isAdminRole, type SessionUser } from "@/lib/auth/types";
import { toSessionUser } from "@/lib/auth/toSessionUser";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { usersCollection } from "@/lib/db/user-collections";

type AdminAuthSuccess = {
  session: SessionUser;
  userId?: string;
};

type AdminAuthFailure = {
  error: string;
  status: number;
};

async function liveAdminFromEmail(email: string): Promise<AdminAuthSuccess | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const db = await getUserDb();
  const user = await usersCollection(db).findOne({ email: normalized });
  if (!user || !isAdminRole(String(user.role || ""))) return null;
  return {
    session: toSessionUser({
      email: String(user.email),
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || String(user.email),
      role: String(user.role || ""),
      organizationRole: String(user.organizationRole || ""),
    }),
    userId: String(user._id),
  };
}

async function sessionFromBearer(request: Request): Promise<AdminAuthSuccess | null> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET) as {
      sub?: string;
      email?: string;
      role?: string;
    };
    if (!payload.email || !isAdminRole(payload.role)) return null;

    const live = await liveAdminFromEmail(payload.email).catch(() => null);
    if (live) return live;

    if (payload.sub && ObjectId.isValid(payload.sub)) {
      const db = await getUserDb();
      const user = await usersCollection(db).findOne({ _id: new ObjectId(payload.sub) });
      if (!user || !isAdminRole(String(user.role || ""))) return null;
      return {
        session: toSessionUser({
          email: String(user.email),
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || String(user.email),
          role: String(user.role || ""),
          organizationRole: String(user.organizationRole || ""),
        }),
        userId: String(user._id),
      };
    }

    return null;
  } catch {
    return null;
  }
}

/** Require an admin / super-admin session whose role still matches MongoDB. */
export async function requireAdminAuth(
  request: Request,
): Promise<AdminAuthSuccess | AdminAuthFailure> {
  const fromBearer = await sessionFromBearer(request);
  if (fromBearer) return fromBearer;

  const jar = await cookies();
  const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!session?.isAdmin) {
    return { error: "Admin authentication required.", status: 401 };
  }

  const live = await liveAdminFromEmail(session.email).catch(() => null);
  if (live) return live;

  try {
    const db = await getUserDb();
    const user = await usersCollection(db).findOne({
      email: session.email.trim().toLowerCase(),
    });
    if (user && !isAdminRole(String(user.role || ""))) {
      return { error: "This account is no longer an administrator.", status: 403 };
    }
  } catch {
    return { session };
  }

  return { error: "This account is no longer an administrator.", status: 403 };
}

export function requireSuperAdmin(
  auth: AdminAuthSuccess,
): AdminAuthFailure | null {
  if (auth.session.role !== "super-admin") {
    return { error: "Super Admin access required.", status: 403 };
  }
  return null;
}

export { liveAdminFromEmail };
