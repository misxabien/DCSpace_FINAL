import { NextResponse } from "next/server";
import { isSchoolEmail } from "@/lib/user-server/auth-helpers";
import { withCors, optionsResponse } from "@/lib/user-server/cors";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { usersCollection } from "@/lib/db/user-collections";
import { verifyPassword } from "@/lib/user-server/password";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { signAuthToken } from "@/lib/user-server/token";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return withCors(NextResponse.json({ error: "email and password are required." }, { status: 400 }));
    }

    if (!isSchoolEmail(email)) {
      return withCors(
        NextResponse.json(
          { error: "Only school email accounts are allowed." },
          { status: 400 },
        ),
      );
    }

    const db = await getUserDb();
    const user = await usersCollection(db).findOne({ email });
    if (!user || !verifyPassword(password, String(user.passwordHash || ""))) {
      return withCors(NextResponse.json({ error: "Invalid email or password." }, { status: 401 }));
    }

    const token = signAuthToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role || "student",
    });

    return withCors(
      NextResponse.json(
        {
          message: "Login successful.",
          token,
          user: sanitizeUser(
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
          ),
        },
        { status: 200 },
      ),
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    const isDatabaseTimeout = /timed out|secureConnect|server selection|connectTimeoutMS|mongo/i.test(
      details,
    );
    if (isDatabaseTimeout) {
      return withCors(
        NextResponse.json(
          {
            error: "Failed to login.",
            details:
              "Could not reach MongoDB. In Atlas → Network Access, allow your current IP (or temporarily 0.0.0.0/0), confirm the cluster is not paused, then try again.",
          },
          { status: 503 },
        ),
      );
    }
    return withCors(NextResponse.json({ error: "Failed to login.", details }, { status: 500 }));
  }
}
