import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  requireAdminAuth,
  requireSuperAdmin,
} from "@/lib/admin-server/require-admin-auth";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { buildUserAttendanceSummary } from "@/lib/user-server/attendance-summary";

const ALLOWED_ROLES = new Set([
  "student",
  "faculty",
  "admin",
  "super-admin",
]);

type RouteContext = { params: Promise<{ id: string }> };

function asSanitized(doc: unknown) {
  return sanitizeUser(
    doc as {
      _id: ObjectId;
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
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const doc = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const user = asSanitized(doc);
    const attendanceSummary = await buildUserAttendanceSummary(user.email);
    return NextResponse.json({ user, attendanceSummary });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load user.", details }, { status: 500 });
  }
}

/** Update a user role / org fields — shared identity between admin + user portals. */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  let body: {
    role?: string;
    organizationRole?: string;
    organizationPart?: string;
    course?: string;
    school?: string;
    firstName?: string;
    lastName?: string;
    studentNumber?: string;
    email?: string;
    rfidNumber?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.role) {
    if (!ALLOWED_ROLES.has(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (
      (body.role === "admin" || body.role === "super-admin") &&
      auth.session.role !== "super-admin"
    ) {
      const denied = requireSuperAdmin(auth);
      if (denied) {
        return NextResponse.json({ error: denied.error }, { status: denied.status });
      }
    }
  }

  try {
    const db = await getUserDb();
    const existing = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const currentRole = String(existing.role || "student");
    if (
      body.role &&
      (currentRole === "admin" || currentRole === "super-admin") &&
      auth.session.role !== "super-admin"
    ) {
      return NextResponse.json(
        { error: "Only a Super Admin can change administrator roles." },
        { status: 403 },
      );
    }

    if (body.role && currentRole === "super-admin" && body.role !== "super-admin") {
      const superCount = await db.collection("users").countDocuments({ role: "super-admin" });
      if (superCount <= 1) {
        return NextResponse.json(
          { error: "The last Super Admin account cannot be demoted." },
          { status: 400 },
        );
      }
    }

    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.role) update.role = body.role;
  if (typeof body.organizationRole === "string") {
    update.organizationRole = body.organizationRole.trim();
  }
  if (typeof body.organizationPart === "string") {
    update.organizationPart = body.organizationPart.trim();
  }
  if (typeof body.course === "string") update.course = body.course.trim();
  if (typeof body.school === "string") update.school = body.school.trim();
  if (typeof body.firstName === "string" && body.firstName.trim()) {
    update.firstName = body.firstName.trim();
  }
  if (typeof body.lastName === "string") update.lastName = body.lastName.trim();
  if (typeof body.studentNumber === "string" && body.studentNumber.trim()) {
    update.studentNumber = body.studentNumber.trim();
  }
  if (typeof body.email === "string" && body.email.trim()) {
    update.email = body.email.trim().toLowerCase();
  }
  if (typeof body.rfidNumber === "string") update.rfidNumber = body.rfidNumber.trim();

    const result = await db.collection("users").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" },
    );

    if (!result) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (body.role && String(existing.role || "") !== body.role) {
      void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
        logUserActivity({
          type: "user_registered",
          actorEmail: auth.session.email,
          actorName: auth.session.name,
          actorRole: auth.session.role,
          targetId: id,
          targetTitle: `${String(existing.firstName || "")} ${String(existing.lastName || "")}`.trim(),
          meta: { action: "role_changed", from: existing.role, to: body.role },
        }),
      );
    }

    return NextResponse.json({
      user: sanitizeUser(
        result as {
          _id: ObjectId;
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
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update user.", details },
      { status: 500 },
    );
  }
}
