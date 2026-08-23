import { NextResponse } from "next/server";
import { encodeSession, sessionCookieOptions } from "@/lib/auth/session";
import { toSessionUser } from "@/lib/auth/toSessionUser";
import { isSchoolEmail } from "@/lib/user-server/auth-helpers";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { usersCollection } from "@/lib/db/user-collections";
import { verifyPassword } from "@/lib/user-server/password";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { signAuthToken } from "@/lib/user-server/token";
import {
  MONGO_QUICK_TIMEOUT_MS,
  withTimeout,
} from "@/lib/user-server/with-timeout";

type LoginBody = {
  email?: string;
  password?: string;
  /** "admin" = admin console login; omit/default = student/organizer portal */
  portal?: "admin" | "user";
  /** When portal is admin, optionally require exact role from selection screen */
  expectedRole?: "admin" | "super-admin";
};

function applyPortalRules(
  sessionUser: ReturnType<typeof toSessionUser>,
  portal: "admin" | "user",
  expectedRole?: "admin" | "super-admin",
) {
  if (portal === "admin") {
    if (!sessionUser.isAdmin) {
      return NextResponse.json(
        { error: "This account is not authorized for the admin console." },
        { status: 403 },
      );
    }
    if (expectedRole === "super-admin" && sessionUser.role !== "super-admin") {
      return NextResponse.json(
        { error: "Sign in with a Super Admin account." },
        { status: 403 },
      );
    }
    return null;
  }

  if (sessionUser.isAdmin) {
    return NextResponse.json(
      {
        error: "Admin accounts must sign in through the Administrator Portal.",
        redirectTo: "/admin",
      },
      { status: 403 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const portal = body.portal === "admin" ? "admin" : "user";
  const expectedRole = body.expectedRole;

  if (!email || !password) {
    return NextResponse.json(
      { error: "School email and password are required." },
      { status: 400 },
    );
  }

  if (!isSchoolEmail(email) && !email.endsWith("@sdca.edu")) {
    return NextResponse.json(
      { error: "Invalid credentials. Use an @sdca.edu.ph school email." },
      { status: 401 },
    );
  }

  // 1) MongoDB first (source of truth when available)
  try {
    const db = await withTimeout(
      getUserDb(),
      MONGO_QUICK_TIMEOUT_MS,
      "MongoDB connect",
    );
    const user = await withTimeout(
      usersCollection(db).findOne({ email }),
      MONGO_QUICK_TIMEOUT_MS,
      "MongoDB user lookup",
    );
    if (user) {
      if (!verifyPassword(password, String(user.passwordHash || ""))) {
        return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
      }

      const sanitized = sanitizeUser(
        user as {
          _id: import("mongodb").ObjectId;
          firstName: string;
          lastName: string;
          studentNumber: string;
          email: string;
          photoUrl?: string;
          bannerUrl?: string;
          role?: string;
          rfidNumber?: string;
          organizationPart?: string;
          organizationRole?: string;
          course?: string;
          school?: string;
        },
      );

      const sessionUser = toSessionUser({
        email: sanitized.email,
        name:
          `${sanitized.firstName || ""} ${sanitized.lastName || ""}`.trim() ||
          sanitized.email,
        role: sanitized.role,
        organizationRole: sanitized.organizationRole,
      });

      const denied = applyPortalRules(sessionUser, portal, expectedRole);
      if (denied) return denied;

      const token = signAuthToken({
        sub: String(user._id),
        email: sanitized.email,
        role: sanitized.role || sessionUser.role,
      });

      try {
        await usersCollection(db).updateOne(
          { _id: user._id },
          { $set: { lastLoginAt: new Date().toISOString() } },
        );
      } catch {
        /* non-blocking */
      }

      void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
        logUserActivity({
          type: "user_login",
          actorEmail: sanitized.email,
          actorName: sessionUser.name,
          actorRole: sanitized.role || sessionUser.role,
          meta: { portal },
        }),
      );

      const response = NextResponse.json({
        user: sessionUser,
        token,
        profile: sanitized,
      });
      response.cookies.set({
        ...sessionCookieOptions(),
        value: encodeSession(sessionUser),
      });
      return response;
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.error("[DC Space] Mongo login lookup failed:", details);
    const isDatabaseIssue =
      /timed out|secureConnect|server selection|connectTimeoutMS|mongo|ECONN|ENOTFOUND|tls|SSL|alert internal error/i.test(
        details,
      );
    if (isDatabaseIssue) {
      return NextResponse.json(
        {
          error:
            "Could not reach MongoDB. In Atlas → Network Access, allow your current IP (or temporarily 0.0.0.0/0), confirm the cluster is not paused, then try again.",
          details,
        },
        { status: 503 },
      );
    }
  }

  return NextResponse.json(
    { error: "Invalid email or password." },
    { status: 401 },
  );
}
