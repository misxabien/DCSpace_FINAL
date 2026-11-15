import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  requireAdminAuth,
  requireSuperAdmin,
} from "@/lib/admin-server/require-admin-auth";
import { feedbackCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";

const STATUSES = ["new", "reviewing", "resolved", "archived"] as const;
type SystemFeedbackStatus = (typeof STATUSES)[number];

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Super Admin updates the status of a system-related feedback report
 * (Reviewing → Resolved / Archived). The submitter is notified when resolved.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const denied = requireSuperAdmin(auth);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid feedback id." }, { status: 400 });
  }

  let body: { status?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const status = String(body.status || "").trim().toLowerCase() as SystemFeedbackStatus;
  if (!STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Status must be new, reviewing, resolved, or archived." },
      { status: 400 },
    );
  }

  try {
    const db = await getUserDb();
    const existing = await feedbackCollection(db).findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
    }
    const isSystem =
      existing.category === "system" ||
      String(existing.type || "").toLowerCase().startsWith("system");
    if (!isSystem) {
      return NextResponse.json(
        { error: "Only system feedback has a review status." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    await feedbackCollection(db).updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          category: "system",
          status,
          statusNote: String(body.note || "").trim(),
          statusUpdatedAt: now,
          statusUpdatedBy: auth.session.email,
        },
      },
    );

    if (status === "resolved" && existing.email) {
      void import("@/lib/user-server/portal").then(({ notifyUser }) =>
        notifyUser({
          email: String(existing.email),
          title: "Your system feedback was resolved",
          body: `"${String(existing.title || "Feedback")}" has been marked resolved by DC Space.`,
          type: "feedback-status",
        }),
      );
    }

    return NextResponse.json({ ok: true, id, status });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update feedback status.", details },
      { status: 500 },
    );
  }
}
