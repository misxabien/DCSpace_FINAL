import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { eventsCollection } from "@/lib/events/types";
import { attendanceCollection, logUserActivity } from "@/lib/user-server/activity";
import {
  countPriorDuplicateAttempts,
  findConcurrentEventConflict,
  logAttendanceSecurityEvent,
  securityKindFromCode,
  type AttendanceSecurityKind,
} from "@/lib/user-server/attendance-security";
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
  persisted?: boolean;
  collection?: string;
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

function rfidDigits(rfid: string) {
  return String(rfid || "").replace(/\D/g, "");
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
  const digits = rfidDigits(rfid);
  const variants = [...new Set([rfid, digits].filter(Boolean))];
  const orFilters: Array<Record<string, unknown>> = variants.flatMap((value) => [
    { rfidNumber: value },
    { rfidNumber: { $regex: `^${escapeRegex(value)}$`, $options: "i" } },
  ]);
  const matches = await usersCollection(db).find({ $or: orFilters }).limit(5).toArray();
  if (!matches.length) return null;

  // Normalize to digit-only identity so 0847593370 and 847593370 resolve consistently.
  const targetDigits = digits || rfid;
  const exact = matches.filter((user) => {
    const storedDigits = rfidDigits(String(user.rfidNumber || ""));
    return storedDigits === targetDigits || normalizeRfid(String(user.rfidNumber || "")) === rfid;
  });
  const pool = exact.length ? exact : matches;
  if (pool.length > 1) {
    throw new AttendanceError(
      "This RFID matches more than one account. Ask an admin to fix duplicate RFID registrations.",
      409,
      "ambiguous_rfid",
    );
  }
  return pool[0];
}

function splitOrgRole(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return { role: "", position: "" };
  if (!raw.includes(":")) return { role: raw, position: "" };
  const [role, ...rest] = raw.split(":");
  return { role: role.trim(), position: rest.join(":").trim() };
}

/** Public profile fields resolved from a users collection document. */
export function profileFromUserDoc(user: Record<string, unknown> | null | undefined) {
  if (!user) {
    return {
      name: "",
      email: "",
      studentNumber: "",
      course: "",
      school: "",
      organization: "",
      organizationRole: "",
      organizationPosition: "",
      rfidNumber: "",
      photoUrl: "",
    };
  }
  const org = splitOrgRole(String(user.organizationRole || ""));
  const name =
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    String(user.fullName || user.name || user.email || "");
  return {
    name,
    email: normalizeEmail(String(user.email || "")),
    studentNumber: String(user.studentNumber || ""),
    course: String(user.course || ""),
    school: String(user.school || ""),
    organization: String(user.organizationPart || user.organization || ""),
    organizationRole: org.role,
    organizationPosition: org.position,
    rfidNumber: String(user.rfidNumber || "").trim(),
    photoUrl: String(user.photoUrl || user.avatarUrl || ""),
  };
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

/** For admin RFID desk: join the event automatically if the RFID user is not yet registered. */
export async function ensureRegisteredForRfidScan(
  userDb: Db,
  input: {
    eventId: string;
    email: string;
    userName: string;
    userId?: string;
    studentNumber?: string;
    course?: string;
  },
) {
  const normalized = normalizeEmail(input.email);
  const existing = await registrationsCollection(userDb).findOne({
    eventId: input.eventId,
    email: { $regex: `^${escapeRegex(normalized)}$`, $options: "i" },
  });
  if (existing) {
    if (!["joined", "approved"].includes(String(existing.status || ""))) {
      await registrationsCollection(userDb).updateOne(
        { _id: existing._id },
        {
          $set: {
            status: "joined",
            updatedAt: new Date().toISOString(),
          },
        },
      );
    }
    return existing;
  }

  const now = new Date().toISOString();
  const doc = {
    eventId: input.eventId,
    email: normalized,
    userId: input.userId || "",
    userName: input.userName || normalized,
    studentNumber: input.studentNumber || "",
    course: input.course || "",
    status: "joined",
    source: "rfid-desk",
    createdAt: now,
    updatedAt: now,
  };
  await registrationsCollection(userDb).insertOne(doc);
  return doc;
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
  if (!["live", "approved"].includes(String(event.status || ""))) {
    throw new AttendanceError(
      "Attendance is only open for approved or live events. Set the event to Live first if needed.",
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
    persisted: true,
    collection: "attendance_records",
  };
}

export async function recordRfidScan(input: {
  eventId: string;
  rfidNumber: string;
  /** Explicit desk mode. Required for separated Tap In / Tap Out. */
  action?: AttendanceAction;
  actor: { email: string; name: string; role: string };
}) {
  const rfid = normalizeRfid(input.rfidNumber);
  const requestedAction: AttendanceAction =
    input.action === "out" ? "out" : input.action === "in" ? "in" : "in";

  const reject = async (
    message: string,
    status: number,
    code: string,
    extra?: {
      email?: string;
      participantName?: string;
      kind?: AttendanceSecurityKind;
      relatedEventId?: string;
      relatedEventTitle?: string;
    },
  ): Promise<never> => {
    const kind = extra?.kind || securityKindFromCode(code);
    await logAttendanceSecurityEvent({
      eventId: input.eventId,
      kind,
      code,
      message,
      rfidNumber: rfid || String(input.rfidNumber || "").trim(),
      email: extra?.email,
      participantName: extra?.participantName,
      requestedAction,
      actorEmail: input.actor.email,
      actorName: input.actor.name,
      relatedEventId: extra?.relatedEventId,
      relatedEventTitle: extra?.relatedEventTitle,
    });
    throw new AttendanceError(message, status, code);
  };

  if (!rfid) {
    await reject("RFID tag is required.", 400, "missing_rfid");
  }

  let matchedUser;
  try {
    matchedUser = await findUserByRfid(rfid);
  } catch (error) {
    if (error instanceof AttendanceError) {
      await reject(error.message, error.status, error.code, {
        participantName: `RFID ${rfid}`,
        kind: "invalid_scan",
      });
    }
    throw error;
  }
  if (!matchedUser) {
    await reject(
      "This RFID is not registered in the system.",
      404,
      "unknown_rfid",
      { participantName: `Unknown RFID ${rfid}`, kind: "invalid_scan" },
    );
  }

  const student = matchedUser!;
  const email = normalizeEmail(String(student.email || ""));
  const userDb = await getUserDb();
  const userName =
    `${student.firstName || ""} ${student.lastName || ""}`.trim() || email;

  await ensureRegisteredForRfidScan(userDb, {
    eventId: input.eventId,
    email,
    userName,
    userId: String(student._id || ""),
    studentNumber: String(student.studentNumber || ""),
    course: String(student.course || ""),
  });

  const lastRecord = await attendanceCollection(userDb)
    .find({ eventId: input.eventId, email })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  const alreadyInside = lastRecord?.action === "in";
  const rfidLabel = rfidDigits(rfid) || rfid;

  // Attending two events at once — tapped in elsewhere within the last minute.
  if (requestedAction === "in" && !alreadyInside) {
    const conflict = await findConcurrentEventConflict(userDb, email, input.eventId);
    if (conflict) {
      const currentEvent = ObjectId.isValid(input.eventId)
        ? await eventsCollection(userDb).findOne(
            { _id: new ObjectId(input.eventId) },
            { projection: { title: 1 } },
          )
        : null;
      const currentEventTitle = String(currentEvent?.title || "this event");
      await reject(
        `Suspicious: ${userName} is attending two events at the same time — still tapped in at "${conflict.eventTitle}" and trying to tap in at "${currentEventTitle}". They tapped in at "${conflict.eventTitle}" within the last minute. Tap out from one event before tapping in at the other.`,
        409,
        "concurrent_event",
        {
          email,
          participantName: userName,
          kind: "concurrent_event",
          relatedEventId: conflict.eventId,
          relatedEventTitle: conflict.eventTitle,
        },
      );
    }
  }

  // Duplicate entry — already inside (never tapped out), trying to tap in again.
  if (requestedAction === "in" && alreadyInside) {
    const priorAttempts = await countPriorDuplicateAttempts(userDb, input.eventId, email);
    if (priorAttempts === 0) {
      await reject(
        `Duplicate entry: ${userName} (RFID ${rfidLabel}) is already tapped in and did not tap out. Use Tap Out when they leave. Different cards/students can still tap in.`,
        409,
        "duplicate_warning",
        { email, participantName: userName, kind: "duplicate_warning" },
      );
    }
    await reject(
      `Duplicate entry: ${userName} (RFID ${rfidLabel}) tried to tap in again without tapping out. If you used a different card, verify it is registered to a different student.`,
      409,
      "duplicate_entry",
      { email, participantName: userName, kind: "duplicate_entry" },
    );
  }

  // Multiple taps — same RFID tapped consecutively (same action within 1 minute).
  const RAPID_TAP_WINDOW_MS = 60_000;
  const rfidMatch: Array<Record<string, string>> = [{ rfidNumber: rfid }];
  const digits = rfidDigits(rfid);
  if (digits && digits !== rfid) {
    rfidMatch.push({ rfidNumber: digits });
  }
  const recentSameRfid = await attendanceCollection(userDb)
    .find({
      eventId: input.eventId,
      $or: rfidMatch,
      createdAt: { $gte: new Date(Date.now() - RAPID_TAP_WINDOW_MS).toISOString() },
    })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  if (recentSameRfid) {
    const recentAction = String(recentSameRfid.action || "in");
    if (recentAction === requestedAction) {
      await reject(
        `Multiple taps: RFID ${rfidLabel} (${userName}) was tapped consecutively within a minute for the same action. Wait before re-scanning this card — different students can still tap one after another.`,
        409,
        "rapid_consecutive",
        { email, participantName: userName, kind: "rapid_consecutive" },
      );
    }
  }

  if (requestedAction === "out" && !alreadyInside) {
    await reject(
      "Cannot tap out — this student has no open tap-in.",
      409,
      "no_open_tap_in",
      { email, participantName: userName, kind: "invalid_scan" },
    );
  }

  const result = await recordAttendanceTap({
    eventId: input.eventId,
    action: requestedAction,
    source: "rfid",
    participant: {
      email,
      name: userName,
      userId: String(student._id || ""),
      studentNumber: String(student.studentNumber || ""),
      course: String(student.course || ""),
      rfidNumber: String(student.rfidNumber || rfid),
      role: String(student.role || "student"),
    },
    actor: input.actor,
  });

  if (result.duplicate) {
    await reject(
      "Duplicate entry detected. This participant is already tapped in.",
      409,
      "duplicate_entry",
      { email, participantName: userName, kind: "duplicate_entry" },
    );
  }

  const profile = profileFromUserDoc(student as Record<string, unknown>);
  return {
    ...result,
    user: {
      ...profile,
      rfidNumber: profile.rfidNumber || rfid,
    },
  };
}

export async function buildLiveAttendanceFeed(
  eventId: string,
  options?: { light?: boolean },
) {
  const userDb = await getUserDb();
  const light = Boolean(options?.light);

  const [event, attendanceDocs, registrationDocs] = await Promise.all([
    ObjectId.isValid(eventId)
      ? eventsCollection(userDb).findOne({ _id: new ObjectId(eventId) })
      : null,
    attendanceCollection(userDb)
      .find({ eventId })
      .sort({ createdAt: -1 })
      .limit(light ? 40 : 100)
      .toArray(),
    light
      ? Promise.resolve([])
      : registrationsCollection(userDb)
          .find({ eventId, status: { $in: ["joined", "approved"] } })
          .project({ email: 1, userName: 1, studentNumber: 1, course: 1 })
          .limit(500)
          .toArray(),
  ]);

  const registeredEmails = light
    ? []
    : registrationDocs.map((row) => normalizeEmail(String(row.email || "")));

  const lookupEmails = light
    ? [
        ...new Set(
          attendanceDocs
            .map((row) => normalizeEmail(String(row.email || "")))
            .filter(Boolean),
        ),
      ].slice(0, 30)
    : registeredEmails;

  const users =
    lookupEmails.length > 0
      ? await usersCollection(userDb)
          .find({
            email: {
              $in: lookupEmails,
            },
          })
          .project({
            email: 1,
            rfidNumber: 1,
            firstName: 1,
            lastName: 1,
            studentNumber: 1,
            course: 1,
            school: 1,
            organizationPart: 1,
            organization: 1,
            organizationRole: 1,
            photoUrl: 1,
            avatarUrl: 1,
          })
          .toArray()
      : [];

  const userByEmail = new Map(
    users.map((user) => [normalizeEmail(String(user.email || "")), user]),
  );
  const rfidByEmail = new Map(
    users.map((user) => [
      normalizeEmail(String(user.email || "")),
      String(user.rfidNumber || "").trim(),
    ]),
  );

  const latestDoc = attendanceDocs[0];
  const latestEmail = latestDoc
    ? normalizeEmail(String(latestDoc.email || ""))
    : "";
  const latestUser = latestEmail ? userByEmail.get(latestEmail) : null;
  // If attendance email isn't in the registration projection set, look up once.
  const latestProfile = latestUser
    ? profileFromUserDoc(latestUser as Record<string, unknown>)
    : latestEmail
      ? profileFromUserDoc(
          (await usersCollection(userDb).findOne({
            email: { $regex: `^${escapeRegex(latestEmail)}$`, $options: "i" },
          })) as Record<string, unknown> | null,
        )
      : profileFromUserDoc(null);

  if (latestDoc && !latestProfile.rfidNumber) {
    latestProfile.rfidNumber = String(
      latestDoc.rfidNumber || rfidByEmail.get(latestEmail) || "",
    );
  }
  if (latestDoc && !latestProfile.email) {
    latestProfile.email = String(latestDoc.email || "");
  }
  if (latestDoc && !latestProfile.name) {
    latestProfile.name = String(
      latestDoc.participantName || latestDoc.userName || latestProfile.email,
    );
  }
  if (latestDoc && !latestProfile.studentNumber) {
    latestProfile.studentNumber = String(latestDoc.studentNumber || "");
  }
  if (latestDoc && !latestProfile.course) {
    latestProfile.course = String(latestDoc.course || "");
  }

  const latestScan = latestDoc
    ? {
        id: String(latestDoc._id),
        participantName: latestProfile.name,
        email: latestProfile.email || String(latestDoc.email || ""),
        action: String(latestDoc.action || "in"),
        scannedAt: String(latestDoc.scannedAt || latestDoc.createdAt || ""),
        rfidNumber: latestProfile.rfidNumber || String(latestDoc.rfidNumber || ""),
        studentNumber: latestProfile.studentNumber,
        course: latestProfile.course,
        school: latestProfile.school,
        organization: latestProfile.organization,
        organizationRole: latestProfile.organizationRole,
        organizationPosition: latestProfile.organizationPosition,
        photoUrl: latestProfile.photoUrl,
        eventTitle: String(latestDoc.eventTitle || event?.title || ""),
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

  const registeredRfids = light
    ? []
    : registrationDocs
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
      registrations: light ? 0 : registrationDocs.length,
      registeredWithRfid: registeredRfids.length,
      tapIn: tapInCount,
      tapOut: tapOutCount,
      currentlyInside: openTapIns.size,
    },
  };
}
