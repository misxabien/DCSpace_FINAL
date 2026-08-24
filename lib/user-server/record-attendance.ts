import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { eventsCollection } from "@/lib/events/types";
import { attendanceCollection, logUserActivity } from "@/lib/user-server/activity";
import { registrationsCollection } from "@/lib/user-server/portal";
import { createCertificateDoc } from "@/lib/user-server/certificates";

export type AttendanceAction = "in" | "out";

export type AttendanceParticipant = {
  email: string;
  name: string;
  userId?: string;
  studentNumber?: string;
  course?: string;
  rfidNumber?: string;
  role?: string;
};

export type RecordAttendanceInput = {
  eventId: string;
  action: AttendanceAction;
  participant: AttendanceParticipant;
  source: "rfid" | "session";
  eventTitle?: string;
  actor?: { email: string; name: string; role: string };
};

export type RecordAttendanceResult = {
  id: string;
  eventId: string;
  eventTitle: string;
  email: string;
  participantName: string;
  action: AttendanceAction;
  scannedAt: string;
  attendanceMinutes?: number;
  qualifiedForCertificate?: boolean;
  duplicate?: boolean;
  certificateId?: string;
  rfidNumber?: string;
};

export class AttendanceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "attendance_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeRfid(rfid: string) {
  return String(rfid || "").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function usersCollection(db: Db) {
  return db.collection("users");
}

export async function findUserByRfid(rfidNumber: string) {
  const rfid = normalizeRfid(rfidNumber);
  if (!rfid) return null;
  const db = await getUserDb();
  return usersCollection(db).findOne({
    rfidNumber: { $regex: `^${escapeRegex(rfid)}$`, $options: "i" },
  });
}

export async function assertRegisteredForEvent(
  userDb: Db,
  eventId: string,
  email: string,
) {
  const normalized = normalizeEmail(email);
  const registration = await registrationsCollection(userDb).findOne({
    eventId,
    email: { $regex: `^${escapeRegex(normalized)}$`, $options: "i" },
    status: { $in: ["joined", "approved"] },
  });
  if (!registration) {
    throw new AttendanceError(
      "This participant is not registered for this event.",
      403,
      "not_registered",
    );
  }
  return registration;
}

export async function loadLiveEvent(eventId: string) {
  if (!ObjectId.isValid(eventId)) {
    throw new AttendanceError("Invalid event id.", 400, "invalid_event");
  }
  const db = await getUserDb();
  const event = await eventsCollection(db).findOne({ _id: new ObjectId(eventId) });
  if (!event) {
    throw new AttendanceError("Event not found.", 404, "event_not_found");
  }
  if (String(event.status || "") !== "live") {
    throw new AttendanceError(
      "Attendance is only open while the event is live.",
      403,
      "event_not_live",
    );
  }
  return event;
}

export async function recordAttendanceTap(
  input: RecordAttendanceInput,
): Promise<RecordAttendanceResult> {
  const userDb = await getUserDb();
  const eventId = String(input.eventId || "").trim();
  const action = input.action === "out" ? "out" : "in";
  const email = normalizeEmail(input.participant.email);
  const now = new Date().toISOString();

  const event = await loadLiveEvent(eventId);
  await assertRegisteredForEvent(userDb, eventId, email);

  const eventTitle =
    String(input.eventTitle || "").trim() || String(event.title || "Event");

  const lastRecord = await attendanceCollection(userDb)
    .find({ eventId, email })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  if (action === "in" && lastRecord?.action === "in") {
    return {
      id: String(lastRecord._id || ""),
      eventId,
      eventTitle: String(lastRecord.eventTitle || eventTitle),
      email,
      participantName: String(
        lastRecord.participantName || input.participant.name || email,
      ),
      action: "in",
      scannedAt: String(lastRecord.scannedAt || lastRecord.createdAt || now),
      duplicate: true,
      rfidNumber: String(lastRecord.rfidNumber || input.participant.rfidNumber || ""),
    };
  }

  if (action === "out" && lastRecord?.action !== "in") {
    throw new AttendanceError(
      "Cannot tap out — no open tap-in found for this participant.",
      409,
      "no_open_tap_in",
    );
  }

  const doc: Record<string, unknown> = {
    eventId,
    eventTitle,
    email,
    participantName: input.participant.name || email,
    userId: input.participant.userId || "",
    studentNumber: input.participant.studentNumber || "",
    course: input.participant.course || "",
    rfidNumber: normalizeRfid(input.participant.rfidNumber || ""),
    action,
    status: "recorded",
    source: input.source,
    scannedAt: now,
    createdAt: now,
  };

  let certificateId: string | undefined;

  if (action === "out") {
    const lastTapIn = await attendanceCollection(userDb)
      .find({ eventId, email, action: "in" })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();

    if (lastTapIn?.scannedAt) {
      const durationMs =
        new Date(now).getTime() - new Date(String(lastTapIn.scannedAt)).getTime();
      const attendanceMinutes = Math.max(0, Math.round(durationMs / 60000));
      const requiredMinutes = Number(event.attendanceRequiredMinutes || 0);
      const qualifiedForCertificate =
        requiredMinutes > 0 && attendanceMinutes >= requiredMinutes;
      doc.pairedTapInId = String(lastTapIn._id || "");
      doc.attendanceMinutes = attendanceMinutes;
      doc.qualifiedForCertificate = qualifiedForCertificate;

      if (qualifiedForCertificate && event.certificateTemplateBase64) {
        const existingCert = await userDb.collection("certificates").findOne({
          eventId,
          email,
        });
        if (!existingCert) {
          const createdCert = await createCertificateDoc({
            db: userDb,
            event: {
              id: eventId,
              title: String(event.title || eventTitle),
              startsAt: String(event.startsAt || ""),
              certificateTemplateBase64: String(event.certificateTemplateBase64 || ""),
            },
            recipient: {
              email,
              userName: input.participant.name || email,
            },
            generatedBy: {
              email: input.actor?.email || email,
              name: input.actor?.name || input.participant.name || email,
              role: input.actor?.role || input.participant.role || "student",
            },
            qualificationSource: "attendance",
            attendanceMinutes,
          });
          certificateId = createdCert.id;
        } else {
          certificateId = String(existingCert._id || "");
        }
      }
    }
  }

  const result = await attendanceCollection(userDb).insertOne(doc);

  const actor = input.actor || {
    email,
    name: input.participant.name || email,
    role: input.participant.role || "student",
  };

  await logUserActivity({
    type: "attendance_recorded",
    actorEmail: actor.email,
    actorName: actor.name,
    actorRole: actor.role,
    targetId: eventId,
    targetTitle: eventTitle,
    meta: {
      action,
      source: input.source,
      attendanceId: String(result.insertedId),
      rfidNumber: doc.rfidNumber,
      attendanceMinutes: doc.attendanceMinutes ?? null,
      qualifiedForCertificate: doc.qualifiedForCertificate ?? false,
    },
  });

  return {
    id: String(result.insertedId),
    eventId,
    eventTitle,
    email,
    participantName: String(doc.participantName),
    action,
    scannedAt: now,
    attendanceMinutes: Number(doc.attendanceMinutes || 0) || undefined,
    qualifiedForCertificate: Boolean(doc.qualifiedForCertificate),
    certificateId,
    rfidNumber: String(doc.rfidNumber || ""),
  };
}

export async function recordRfidScan(input: {
  eventId: string;
  rfidNumber: string;
  actor: { email: string; name: string; role: string };
}) {
  const rfid = normalizeRfid(input.rfidNumber);
  if (!rfid) {
    throw new AttendanceError("RFID tag is required.", 400, "missing_rfid");
  }

  const user = await findUserByRfid(rfid);
  if (!user) {
    throw new AttendanceError("RFID tag is not registered in DC Space.", 404, "unknown_rfid");
  }

  const email = normalizeEmail(String(user.email || ""));
  const userDb = await getUserDb();
  await assertRegisteredForEvent(userDb, input.eventId, email);

  const lastRecord = await attendanceCollection(userDb)
    .find({ eventId: input.eventId, email })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  const action: AttendanceAction = lastRecord?.action === "in" ? "out" : "in";

  const result = await recordAttendanceTap({
    eventId: input.eventId,
    action,
    source: "rfid",
    participant: {
      email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || email,
      userId: String(user._id || ""),
      studentNumber: String(user.studentNumber || ""),
      course: String(user.course || ""),
      rfidNumber: String(user.rfidNumber || rfid),
      role: String(user.role || "student"),
    },
    actor: input.actor,
  });

  return { ...result, user: { email, name: result.participantName, rfidNumber: rfid } };
}

export async function buildLiveAttendanceFeed(eventId: string) {
  const userDb = await getUserDb();

  const [event, attendanceDocs, registrationDocs] = await Promise.all([
    ObjectId.isValid(eventId)
      ? eventsCollection(userDb).findOne({ _id: new ObjectId(eventId) })
      : null,
    attendanceCollection(userDb)
      .find({ eventId })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    registrationsCollection(userDb)
      .find({ eventId, status: { $in: ["joined", "approved"] } })
      .project({ email: 1, userName: 1, studentNumber: 1, course: 1 })
      .limit(500)
      .toArray(),
  ]);

  const registeredEmails = registrationDocs.map((row) =>
    normalizeEmail(String(row.email || "")),
  );

  const users =
    registeredEmails.length > 0
      ? await usersCollection(userDb)
          .find({
            email: {
              $in: registeredEmails,
            },
          })
          .project({ email: 1, rfidNumber: 1, firstName: 1, lastName: 1 })
          .toArray()
      : [];

  const rfidByEmail = new Map(
    users.map((user) => [
      normalizeEmail(String(user.email || "")),
      String(user.rfidNumber || "").trim(),
    ]),
  );

  const latestScan = attendanceDocs[0]
    ? {
        id: String(attendanceDocs[0]._id),
        participantName: String(
          attendanceDocs[0].participantName || attendanceDocs[0].userName || "",
        ),
        email: String(attendanceDocs[0].email || ""),
        action: String(attendanceDocs[0].action || "in"),
        scannedAt: String(
          attendanceDocs[0].scannedAt || attendanceDocs[0].createdAt || "",
        ),
        rfidNumber: String(attendanceDocs[0].rfidNumber || ""),
        eventTitle: String(attendanceDocs[0].eventTitle || event?.title || ""),
      }
    : null;

  const openTapIns = new Set<string>();
  for (const row of [...attendanceDocs].reverse()) {
    const email = normalizeEmail(String(row.email || ""));
    if (row.action === "in") openTapIns.add(email);
    else openTapIns.delete(email);
  }

  const recentScans = attendanceDocs.slice(0, 20).map((row) => ({
    id: String(row._id),
    participantName: String(row.participantName || row.userName || ""),
    email: String(row.email || ""),
    action: String(row.action || "in"),
    scannedAt: String(row.scannedAt || row.createdAt || ""),
    rfidNumber: String(row.rfidNumber || rfidByEmail.get(normalizeEmail(String(row.email || ""))) || ""),
    attendanceMinutes: Number(row.attendanceMinutes || 0),
    qualifiedForCertificate: Boolean(row.qualifiedForCertificate),
  }));

  const registeredRfids = registrationDocs
    .map((row) => {
      const email = normalizeEmail(String(row.email || ""));
      const rfid = rfidByEmail.get(email) || "";
      return {
        email,
        userName: String(row.userName || ""),
        studentNumber: String(row.studentNumber || ""),
        course: String(row.course || ""),
        rfidNumber: rfid,
      };
    })
    .filter((row) => Boolean(row.rfidNumber));

  const tapInCount = attendanceDocs.filter((row) => row.action === "in").length;
  const tapOutCount = attendanceDocs.filter((row) => row.action === "out").length;

  return {
    event: event
      ? {
          id: String(event._id),
          title: String(event.title || ""),
          status: String(event.status || ""),
          startsAt: String(event.startsAt || ""),
          endsAt: String(event.endsAt || ""),
        }
      : null,
    latestScan,
    recentScans,
    currentlyInside: [...openTapIns],
    registeredRfids,
    stats: {
      registrations: registrationDocs.length,
      registeredWithRfid: registeredRfids.length,
      tapIn: tapInCount,
      tapOut: tapOutCount,
      currentlyInside: openTapIns.size,
    },
  };
}
