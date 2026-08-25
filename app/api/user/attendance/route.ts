import { NextResponse } from "next/server";
import { attendanceCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  AttendanceError,
  recordAttendanceTap,
} from "@/lib/user-server/record-attendance";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pairSessions(
  docs: Array<{
    action?: string;
    scannedAt?: string;
    createdAt?: string;
    attendanceMinutes?: number;
    qualifiedForCertificate?: boolean;
    eventId?: string;
    eventTitle?: string;
    id?: string;
  }>,
) {
  // Oldest → newest so pairs reconstruct correctly.
  const chronological = [...docs].reverse();
  const sessions: Array<{
    eventId: string;
    eventTitle: string;
    tapInAt: string;
    tapOutAt: string;
    attendanceMinutes: number;
    qualifiedForCertificate: boolean;
    open: boolean;
  }> = [];

  let openIn = "";
  let openEventId = "";
  let openEventTitle = "";

  for (const row of chronological) {
    const stamp = String(row.scannedAt || row.createdAt || "");
    const eventId = String(row.eventId || "");
    const eventTitle = String(row.eventTitle || "");
    if (String(row.action || "in") === "in") {
      if (openIn) {
        sessions.push({
          eventId: openEventId,
          eventTitle: openEventTitle,
          tapInAt: openIn,
          tapOutAt: "",
          attendanceMinutes: 0,
          qualifiedForCertificate: false,
          open: true,
        });
      }
      openIn = stamp;
      openEventId = eventId;
      openEventTitle = eventTitle;
    } else {
      sessions.push({
        eventId: openEventId || eventId,
        eventTitle: openEventTitle || eventTitle,
        tapInAt: openIn || "",
        tapOutAt: stamp,
        attendanceMinutes: Number(row.attendanceMinutes || 0),
        qualifiedForCertificate: Boolean(row.qualifiedForCertificate),
        open: false,
      });
      openIn = "";
      openEventId = "";
      openEventTitle = "";
    }
  }
  if (openIn) {
    sessions.push({
      eventId: openEventId,
      eventTitle: openEventTitle,
      tapInAt: openIn,
      tapOutAt: "",
      attendanceMinutes: 0,
      qualifiedForCertificate: false,
      open: true,
    });
  }
  return sessions.reverse();
}

/** Load attendance from MongoDB `attendance_records` for the signed-in user (or admin filter). */
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
    const emailParam = searchParams.get("email");
    const sourceMode = searchParams.get("source");
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = eventId;
    // Student RFID panel: only venue taps from admin live attendance scanner.
    if (sourceMode === "live") {
      filter.source = { $in: ["rfid", "rfid-desk"] };
    }

    const email =
      !isAdmin && actor && !("error" in actor)
        ? actor.email.trim().toLowerCase()
        : isAdmin && emailParam
          ? emailParam.trim().toLowerCase()
          : "";
    if (email) {
      // Case-insensitive match so RFID-linked rows always show for the user account.
      filter.email = { $regex: `^${escapeRegex(email)}$`, $options: "i" };
    }

    const docs = await attendanceCollection(db)
      .find(filter)
      .sort({ scannedAt: -1, createdAt: -1 })
      .limit(500)
      .toArray();

    const attendance = docs.map((doc) => ({
      id: String(doc._id),
      eventId: String(doc.eventId || ""),
      eventTitle: String(doc.eventTitle || doc.eventName || ""),
      email: String(doc.email || "").toLowerCase(),
      participantName: String(doc.participantName || doc.userName || ""),
      action: String(doc.action || "in"),
      status: String(doc.status || "recorded"),
      source: String(doc.source || "session"),
      rfidNumber: String(doc.rfidNumber || ""),
      createdAt: String(doc.createdAt || doc.scannedAt || ""),
      scannedAt: String(doc.scannedAt || doc.createdAt || ""),
      attendanceMinutes: Number(doc.attendanceMinutes || 0),
      qualifiedForCertificate: Boolean(doc.qualifiedForCertificate),
    }));

    return NextResponse.json({
      attendance,
      sessions: pairSessions(attendance),
      total: attendance.length,
      source: "mongodb",
      collection: "attendance_records",
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load attendance.", details },
      { status: 500 },
    );
  }
}

/** Session tap in/out — persists to MongoDB `attendance_records`. */
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
        email: actor.email.trim().toLowerCase(),
        name: actor.name,
        userId: actor.userId,
        studentNumber: actor.studentNumber,
        course: actor.course || "",
        role: actor.role,
      },
      actor: {
        email: actor.email.trim().toLowerCase(),
        name: actor.name,
        role: actor.role,
      },
    });

    return NextResponse.json(
      {
        attendance: result,
        duplicate: Boolean(result.duplicate),
        persisted: true,
        collection: "attendance_records",
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
