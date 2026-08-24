import { NextResponse } from "next/server";
import { attendanceCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  AttendanceError,
  recordAttendanceTap,
} from "@/lib/user-server/record-attendance";

export async function GET(request: Request) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const db = await getUserDb();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const email = searchParams.get("email");
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = eventId;
    if (!isAdmin && actor && !("error" in actor)) {
      filter.email = actor.email.trim().toLowerCase();
    } else if (isAdmin && email) {
      filter.email = email.trim().toLowerCase();
    }

    const docs = await attendanceCollection(db)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return NextResponse.json({
      attendance: docs.map((doc) => ({
        id: String(doc._id),
        eventId: String(doc.eventId || ""),
        eventTitle: String(doc.eventTitle || doc.eventName || ""),
        email: String(doc.email || ""),
        participantName: String(doc.participantName || doc.userName || ""),
        action: String(doc.action || "in"),
        status: String(doc.status || "recorded"),
        source: String(doc.source || "session"),
        rfidNumber: String(doc.rfidNumber || ""),
        createdAt: String(doc.createdAt || doc.scannedAt || ""),
        scannedAt: String(doc.scannedAt || doc.createdAt || ""),
        attendanceMinutes: Number(doc.attendanceMinutes || 0),
        qualifiedForCertificate: Boolean(doc.qualifiedForCertificate),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load attendance.", details },
      { status: 500 },
    );
  }
}

/** Session tap in/out — only for the logged-in user who is registered for the event. */
export async function POST(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body: {
    eventId?: string;
    eventName?: string;
    action?: "in" | "out";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }

  const action = body.action === "out" ? "out" : "in";

  try {
    const result = await recordAttendanceTap({
      eventId,
      action,
      source: "session",
      eventTitle: String(body.eventName || "").trim(),
      participant: {
        email: actor.email,
        name: actor.name,
        userId: actor.userId,
        studentNumber: actor.studentNumber,
        course: actor.course || "",
        role: actor.role,
      },
      actor: {
        email: actor.email,
        name: actor.name,
        role: actor.role,
      },
    });

    return NextResponse.json(
      {
        attendance: result,
        duplicate: Boolean(result.duplicate),
        certificate: result.certificateId
          ? {
              id: result.certificateId,
              attendanceMinutes: result.attendanceMinutes,
            }
          : null,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof AttendanceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to record attendance.", details },
      { status: 500 },
    );
  }
}
