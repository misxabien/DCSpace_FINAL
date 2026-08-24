import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import { decodeSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/types";
import { getUserDb } from "@/lib/user-server/get-user-db";

export type SessionActor = {
  email: string;
  name: string;
  role: string;
  userId?: string;
  studentNumber?: string;
  course?: string;
};

type AuthFailure = { error: string; status: number };

/** Accept httpOnly session cookie or Bearer JWT (student/organizer). */
export async function requireSessionActor(
  request: Request,
): Promise<SessionActor | AuthFailure> {
  const jar = await cookies();
  const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (session) {
    try {
      const db = await getUserDb();
      const user = await db.collection("users").findOne({ email: session.email });
      if (user) {
        return {
          email: String(user.email),
          name:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            session.name,
          role: String(user.role || session.role),
          userId: String(user._id),
          studentNumber: String(user.studentNumber || ""),
          course: String(user.course || ""),
        };
      }
    } catch {
      /* fall through with cookie session */
    }
    return {
      email: session.email,
      name: session.name,
      role: session.role,
    };
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !process.env.JWT_SECRET) {
    return { error: "Authentication required.", status: 401 };
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET) as {
      sub?: string;
      email?: string;
      role?: string;
    };
    if (!payload.email) {
      return { error: "Invalid auth token.", status: 401 };
    }

    if (payload.sub && ObjectId.isValid(payload.sub)) {
      const db = await getUserDb();
      const user = await db.collection("users").findOne({
        _id: new ObjectId(payload.sub),
      });
      if (user) {
        return {
          email: String(user.email),
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || payload.email,
          role: String(user.role || payload.role || "student"),
          userId: String(user._id),
          studentNumber: String(user.studentNumber || ""),
          course: String(user.course || ""),
        };
      }
    }

    return {
      email: payload.email,
      name: payload.email,
      role: payload.role || "student",
      userId: payload.sub,
    };
  } catch {
    return { error: "Invalid or expired auth token.", status: 401 };
  }
}
