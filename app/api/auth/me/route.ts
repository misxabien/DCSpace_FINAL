import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { liveAdminFromEmail } from "@/lib/admin-server/require-admin-auth";
import { decodeSession, encodeSession, sessionCookieOptions } from "@/lib/auth/session";
import { SESSION_COOKIE, isAdminRole } from "@/lib/auth/types";
import { toSessionUser } from "@/lib/auth/toSessionUser";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { usersCollection } from "@/lib/db/user-collections";

const ME_CACHE_TTL_MS = 30_000;
const meCache = new Map<string, { at: number; user: Awaited<ReturnType<typeof toSessionUser>> }>();

export async function GET() {
  const jar = await cookies();
  const cookieUser = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!cookieUser) {
    return NextResponse.json({ user: null });
  }

  try {
    const cacheKey = cookieUser.email.trim().toLowerCase();
    const cached = meCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ME_CACHE_TTL_MS) {
      return NextResponse.json({ user: cached.user });
    }

    const db = await getUserDb();
    const doc = await usersCollection(db).findOne(
      { email: cacheKey },
      {
        projection: {
          email: 1,
          firstName: 1,
          lastName: 1,
          role: 1,
          organizationRole: 1,
        },
      },
    );
    if (!doc) {
      return NextResponse.json({ user: cookieUser });
    }

    const live = toSessionUser({
      email: String(doc.email),
      name: `${doc.firstName || ""} ${doc.lastName || ""}`.trim() || String(doc.email),
      role: String(doc.role || ""),
      organizationRole: String(doc.organizationRole || ""),
    });

    meCache.set(cacheKey, { at: Date.now(), user: live });

    if (cookieUser.isAdmin && !isAdminRole(live.role)) {
      const response = NextResponse.json({ user: null });
      response.cookies.set({ ...sessionCookieOptions(0), value: "" });
      return response;
    }

    const response = NextResponse.json({ user: live });
    if (
      live.role !== cookieUser.role ||
      live.name !== cookieUser.name ||
      live.isAdmin !== cookieUser.isAdmin ||
      live.isOrganizer !== cookieUser.isOrganizer
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
