import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  requireAdminAuth,
  requireSuperAdmin,
} from "@/lib/admin-server/require-admin-auth";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { buildUserAttendanceSummary } from "@/lib/user-server/attendance-summary";
import {
  requireAdminPermission,
  sanitizeAdminPermissions,
} from "@/lib/admin-server/admin-permissions";
import type { UserPermissions } from "@/lib/user-server/organizer-access";

const USER_PERMISSION_KEYS: Array<keyof UserPermissions> = [
  "joinEvents",
  "eventsOrganizedPage",
  "createEvents",
  "editEvents",
  "inviteSomeone",
  "seeWhoAttended",
  "reviewFilesSubmitted",
  "reviewAttendanceStatus",
];

function sanitizeUserPermissions(input: unknown): Partial<UserPermissions> {
  const out: Partial<UserPermissions> = {};
  if (!input || typeof input !== "object") return out;
  for (const key of USER_PERMISSION_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** Admin-only account controls returned alongside the profile. */
function accountControls(doc: Record<string, unknown>) {
  return {
    permissions: (doc.permissions || {}) as UserPermissions,
    suspended: doc.suspended === true,
    adminPermissions: (doc.adminPermissions || null) as Record<string, boolean> | null,
    lastLoginAt: String(doc.lastLoginAt || ""),
  };
}

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
    const user = { ...asSanitized(doc), ...accountControls(doc) };
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
    /** Organizer / participant switches ("Admin Actions"). */
    permissions?: Partial<UserPermissions>;
    suspended?: boolean;
    /** Admin "System Permissions" — Super Admin only, admin targets only. */
    adminPermissions?: Record<string, boolean>;
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
    const targetIsAdmin = currentRole === "admin" || currentRole === "super-admin";
    const isSuper = auth.session.role === "super-admin";

    // Regular admins may not edit, suspend or re-permission administrator accounts.
    if (targetIsAdmin && !isSuper) {
      return NextResponse.json(
        { error: "Only a Super Admin can change administrator accounts." },
        { status: 403 },
      );
    }
    if (body.adminPermissions !== undefined) {
      if (!isSuper) {
        return NextResponse.json(
          { error: "Only a Super Admin can assign admin permissions." },
          { status: 403 },
        );
      }
      if (currentRole !== "admin") {
        return NextResponse.json(
          { error: "System permissions apply to Admin accounts only." },
          { status: 400 },
        );
      }
    }
    if (typeof body.suspended === "boolean") {
      if (String(existing.email || "").toLowerCase() === auth.session.email.toLowerCase()) {
        return NextResponse.json({ error: "You cannot suspend your own account." }, { status: 400 });
      }
      if (currentRole === "super-admin") {
        return NextResponse.json({ error: "Super Admin accounts cannot be suspended." }, { status: 400 });
      }
      const denied = await requireAdminPermission(auth, "suspend-accounts");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
    }
    const editsProfile = [
      body.organizationRole,
      body.organizationPart,
      body.course,
      body.school,
      body.firstName,
      body.lastName,
      body.studentNumber,
      body.email,
      body.rfidNumber,
    ].some((value) => typeof value === "string");
    if (editsProfile || body.permissions !== undefined) {
      const denied = await requireAdminPermission(auth, "update-user-information");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
    }
    if (typeof body.rfidNumber === "string" && body.rfidNumber.trim()) {
      const clash = await db.collection("users").findOne({
        rfidNumber: body.rfidNumber.trim(),
        _id: { $ne: new ObjectId(id) },
      });
      if (clash) {
        return NextResponse.json(
          { error: "This RFID tag is already linked to another account." },
          { status: 409 },
        );
      }
    }

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
  if (body.permissions !== undefined) {
    for (const [key, value] of Object.entries(sanitizeUserPermissions(body.permissions))) {
      update[`permissions.${key}`] = value;
    }
  }
  if (typeof body.suspended === "boolean") {
    update.suspended = body.suspended;
    update.suspendedAt = body.suspended ? new Date().toISOString() : "";
    update.suspendedBy = body.suspended ? auth.session.email : "";
  }
  if (body.adminPermissions !== undefined) {
    update.adminPermissions = sanitizeAdminPermissions(body.adminPermissions);
  }

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
      user: { ...accountControls(result as Record<string, unknown>), ...sanitizeUser(
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
      ) },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update user.", details },
      { status: 500 },
    );
  }
}

/** Delete an account. Admins delete students/faculty; only a Super Admin deletes admins. */
export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const denied = await requireAdminPermission(auth, "delete-accounts");
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const existing = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const role = String(existing.role || "student");
    if (String(existing.email || "").toLowerCase() === auth.session.email.toLowerCase()) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
    }
    if (role === "super-admin") {
      return NextResponse.json({ error: "Super Admin accounts cannot be deleted." }, { status: 400 });
    }
    if ((role === "admin" || role === "admin-pending") && auth.session.role !== "super-admin") {
      return NextResponse.json(
        { error: "Only a Super Admin can delete administrator accounts." },
        { status: 403 },
      );
    }

    // Attendance, certificates and feedback stay as historical event records.
    await db.collection("users").deleteOne({ _id: new ObjectId(id) });

    void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
      logUserActivity({
        type: "account_updated",
        actorEmail: auth.session.email,
        actorName: auth.session.name,
        actorRole: auth.session.role,
        targetId: id,
        targetTitle: `${String(existing.firstName || "")} ${String(existing.lastName || "")}`.trim(),
        meta: { action: "account_deleted", email: existing.email, role },
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to delete user.", details }, { status: 500 });
  }
}
