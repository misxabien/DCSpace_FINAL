import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { liveAdminFromEmail } from "@/lib/admin-server/require-admin-auth";
import { decodeSession, encodeSession, sessionCookieOptions } from "@/lib/auth/session";
import { SESSION_COOKIE, isAdminRole } from "@/lib/auth/types";
import { toSessionUser } from "@/lib/auth/toSessionUser";
import { getUserDb } from "@/lib/user-server/get-user-db";

export async function GET() {
  const jar = await cookies();
  const cookieUser = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!cookieUser) {
    return NextResponse.json({ user: null });
  }

  try {
    const db = await getUserDb();
    const doc = await db.collection("users").findOne({
      email: cookieUser.email.trim().toLowerCase(),
    });
    if (!doc) {
      return NextResponse.json({ user: cookieUser });
    }

    const live = toSessionUser({
      email: String(doc.email),
      name: `${doc.firstName || ""} ${doc.lastName || ""}`.trim() || String(doc.email),
      role: String(doc.role || ""),
      organizationRole: String(doc.organizationRole || ""),
    });

    if (cookieUser.isAdmin && !isAdminRole(live.role)) {
      const response = NextResponse.json({ user: null });
      response.cookies.set({ ...sessionCookieOptions(0), value: "" });
      return response;
    }

    const response = NextResponse.json({ user: live });
    if (
      live.role !== cookieUser.role ||
      live.name !== cookieUser.name ||
      live.isAdmin !== cookieUser.isAdmin
    ) {
      response.cookies.set({
        ...sessionCookieOptions(),
        value: encodeSession(live),
      });
    }
    return response;
  } catch {
    if (cookieUser.isAdmin) {
      const live = await liveAdminFromEmail(cookieUser.email);
      if (live) return NextResponse.json({ user: live.session });
    }
    return NextResponse.json({ user: cookieUser });
  }
}
