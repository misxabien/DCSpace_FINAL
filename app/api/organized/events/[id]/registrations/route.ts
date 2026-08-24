import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { attendanceCollection } from "@/lib/user-server/activity";
import { eventOwnedBy } from "@/lib/events/ownership";
import { registrationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const userDb = await getUserDb();
    const adminDb = await getAdminDb();
    const event = await eventsCollection(adminDb).findOne({ _id: new ObjectId(id) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (!eventOwnedBy(event, actor.email, actor.userId)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const docs = await registrationsCollection(userDb)
      .find({ eventId: id })
      .sort({ createdAt: -1 })
      .limit(400)
      .toArray();

    const attendance = await attendanceCollection(userDb)
      .find({ eventId: id })
      .sort({ createdAt: -1 })
      .limit(400)
      .toArray();
    const attendanceByEmail = new Map<string, { minutes: number; qualified: boolean }>();
    for (const row of attendance) {
      const email = String(row.email || "").toLowerCase();
      if (!email) continue;
      const minutes = Number(row.attendanceMinutes || 0);
      const current = attendanceByEmail.get(email);
      attendanceByEmail.set(email, {
        minutes: Math.max(current?.minutes || 0, minutes),
        qualified: Boolean(current?.qualified || row.qualifiedForCertificate),
      });
    }

    return NextResponse.json({
      registrations: docs.map((doc) => {
        const email = String(doc.email || "").toLowerCase();
        const att = attendanceByEmail.get(email);
        return {
          id: String(doc._id),
          eventId: id,
          studentNumber: String(doc.studentNumber || ""),
          studentName: String(doc.userName || doc.email || ""),
          course: String(doc.course || ""),
          school: String(doc.school || ""),
          organization: String(doc.organization || ""),
          organizationRole: String(doc.organizationRole || ""),
          email: String(doc.email || ""),
          status: String(doc.status || "joined"),
          attendanceMinutes: att?.minutes || 0,
          qualifiedForCertificate: Boolean(att?.qualified),
          files: Array.isArray(doc.files)
            ? (doc.files as Array<Record<string, unknown>>).map((file, index) => ({
                id: String(file.id || `file-${index + 1}`),
                name: String(file.name || `File ${index + 1}`),
                fileName: String(file.fileName || file.name || ""),
                mimeType: String(file.mimeType || ""),
                status: String(file.status || "pending"),
                uploaded: Boolean(file.uploaded || file.base64),
                hasFile: Boolean(file.base64),
              }))
            : [],
          createdAt: String(doc.createdAt || ""),
        };
      }),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load registrations.", details },
      { status: 500 },
    );
  }
}
