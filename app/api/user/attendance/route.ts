import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { logUserActivity, attendanceCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { eventsCollection } from "@/lib/events/types";
import { createCertificateDoc } from "@/lib/user-server/certificates";

type AttendanceRecord = {
  _id?: ObjectId;
  eventId?: string;
  eventTitle?: string;
  email?: string;
  participantName?: string;
  userId?: string;
  studentNumber?: string;
  action?: "in" | "out";
  status?: string;
  scannedAt?: string;
  createdAt?: string;
  pairedTapInId?: string;
  attendanceMinutes?: number;
  qualifiedForCertificate?: boolean;
};

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
      filter.email = actor.email;
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

export async function POST(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body: {
    eventId?: string;
    eventName?: string;
    action?: "in" | "out";
    status?: string;
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
  const now = new Date().toISOString();
  const baseDoc: AttendanceRecord = {
    eventId,
    eventTitle: String(body.eventName || "").trim(),
    email: actor.email,
    participantName: actor.name,
    userId: actor.userId || "",
    studentNumber: actor.studentNumber || "",
    action,
    status: String(body.status || "recorded"),
    scannedAt: now,
    createdAt: now,
  };

  try {
    const db = await getUserDb();
    const events = eventsCollection(db);
    const event =
      ObjectId.isValid(eventId)
        ? await events.findOne({ _id: new ObjectId(eventId) })
        : null;
    const eventTitle =
      String(baseDoc.eventTitle || "") || String(event?.title || "");

    if (action === "in") {
      const lastRecord = (await attendanceCollection(db)
        .find({
          eventId,
          email: actor.email,
        })
        .sort({ createdAt: -1 })
        .limit(1)
        .next()) as AttendanceRecord | null;
      if (lastRecord?.action === "in") {
        return NextResponse.json({
          attendance: {
            id: String(lastRecord._id || ""),
            ...lastRecord,
            eventTitle,
          },
          duplicate: true,
        });
      }
    }

    const doc: AttendanceRecord = {
      ...baseDoc,
      eventTitle,
    };

    let qualification:
      | {
          attendanceMinutes: number;
          certificateId?: string;
        }
      | undefined;

    if (action === "out") {
      const lastTapIn = (await attendanceCollection(db)
        .find({
          eventId,
          email: actor.email,
          action: "in",
        })
        .sort({ createdAt: -1 })
        .limit(1)
        .next()) as AttendanceRecord | null;

      if (lastTapIn?.scannedAt) {
        const durationMs =
          new Date(now).getTime() - new Date(lastTapIn.scannedAt).getTime();
        const attendanceMinutes = Math.max(0, Math.round(durationMs / 60000));
        const requiredMinutes = Number(event?.attendanceRequiredMinutes || 0);
        const qualifiedForCertificate =
          requiredMinutes > 0 && attendanceMinutes >= requiredMinutes;
        doc.pairedTapInId = String(lastTapIn._id || "");
        doc.attendanceMinutes = attendanceMinutes;
        doc.qualifiedForCertificate = qualifiedForCertificate;

        if (qualifiedForCertificate && event?.certificateTemplateBase64) {
          const existingCert = await db.collection("certificates").findOne({
            eventId,
            email: actor.email,
          });
          if (!existingCert) {
            const createdCert = await createCertificateDoc({
              db,
              event: {
                id: eventId,
                title: String(event.title || eventTitle || "Event"),
                startsAt: String(event.startsAt || ""),
                certificateTemplateBase64: String(
                  event.certificateTemplateBase64 || "",
                ),
              },
              recipient: {
                email: actor.email,
                userName: actor.name,
              },
              generatedBy: {
                email: actor.email,
                name: actor.name,
                role: actor.role,
              },
              qualificationSource: "attendance",
              attendanceMinutes,
            });
            qualification = {
              attendanceMinutes,
              certificateId: createdCert.id,
            };
          } else {
            qualification = {
              attendanceMinutes,
              certificateId: String(existingCert._id || ""),
            };
          }
        } else if (qualifiedForCertificate) {
          qualification = {
            attendanceMinutes,
          };
        }
      }
    }

    const result = await attendanceCollection(db).insertOne(doc);
    await logUserActivity({
      type: "attendance_recorded",
      actorEmail: actor.email,
      actorName: actor.name,
      actorRole: actor.role,
      targetId: eventId,
      targetTitle: doc.eventTitle,
      meta: {
        action,
        attendanceId: String(result.insertedId),
        attendanceMinutes: doc.attendanceMinutes ?? null,
        qualifiedForCertificate: doc.qualifiedForCertificate ?? false,
      },
    });

    return NextResponse.json(
      {
        attendance: { id: String(result.insertedId), ...doc },
        certificate:
          action === "out" && qualification?.certificateId
            ? {
                id: qualification.certificateId,
                attendanceMinutes: qualification.attendanceMinutes,
              }
            : null,
      },
      { status: 201 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to record attendance.", details },
      { status: 500 },
    );
  }
}
