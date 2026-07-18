import { NextResponse } from "next/server";
import { authenticateKnownMockAccount } from "@/lib/auth/mockUsers";
import { encodeSession, sessionCookieOptions } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";
import { isOrganizerProfile } from "@/lib/organize-access";
import { isSchoolEmail } from "@/lib/user-server/auth-helpers";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { verifyPassword } from "@/lib/user-server/password";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { signAuthToken } from "@/lib/user-server/token";

function toSessionUser(input: {
  email: string;
  name: string;
  isOrganizer: boolean;
}): SessionUser {
  return {
    email: input.email,
    name: input.name,
    role: input.isOrganizer ? "organizer" : "student",
    isOrganizer: input.isOrganizer,
  };
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

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

  // 1) Real MongoDB accounts first (source of truth for registered users)
  try {
    const db = await getUserDb();
    const user = await db.collection("users").findOne({ email });
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

      const isOrganizer = isOrganizerProfile({
        role: sanitized.role,
        organizationRole: sanitized.organizationRole,
      });

      const sessionUser = toSessionUser({
        email: sanitized.email,
        name:
          `${sanitized.firstName || ""} ${sanitized.lastName || ""}`.trim() || sanitized.email,
        isOrganizer,
      });

      const token = signAuthToken({
        sub: String(user._id),
        email: sanitized.email,
        role: sanitized.role || "student",
      });

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
    // Fall through to demo accounts if DB is temporarily unavailable.
  }

  // 2) Demo/mock organizer accounts from main (exact emails only)
  const mockUser = authenticateKnownMockAccount(email, password);
  if (mockUser) {
    const response = NextResponse.json({ user: mockUser });
    response.cookies.set({
      ...sessionCookieOptions(),
      value: encodeSession(mockUser),
    });
    return response;
  }

  return NextResponse.json(
    { error: "Invalid email or password." },
    { status: 401 },
  );
}
