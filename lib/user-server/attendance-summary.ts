import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { attendanceCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { registrationsCollection } from "@/lib/user-server/portal";

export type UserAttendanceSummary = {
  attendanceCompleted: number;
  lateRecords: number;
  undertimeRecords: number;
  absences: number;
  attendanceRate: number;
  eventsAttended: number;
  registrations: number;
  tapIns: number;
  tapOuts: number;
};

type EventMeta = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  requiredMinutes: number;
  graceMinutes: number;
};

function toMs(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Build Attendance Summary for a campus user from live registrations + RFID/session taps.
 */
export async function buildUserAttendanceSummary(
  emailInput: string,
): Promise<UserAttendanceSummary> {
  const email = String(emailInput || "")
    .trim()
    .toLowerCase();
  const empty: UserAttendanceSummary = {
    attendanceCompleted: 0,
    lateRecords: 0,
    undertimeRecords: 0,
    absences: 0,
    attendanceRate: 0,
    eventsAttended: 0,
    registrations: 0,
    tapIns: 0,
    tapOuts: 0,
  };
  if (!email) return empty;

  const db = await getUserDb();
  const [attendanceDocs, registrationDocs] = await Promise.all([
    attendanceCollection(db).find({ email }).sort({ createdAt: 1 }).limit(500).toArray(),
    registrationsCollection(db)
      .find({ email, status: { $in: ["joined", "approved"] } })
      .project({ eventId: 1, status: 1, createdAt: 1 })
      .limit(300)
      .toArray(),
  ]);

  const eventIds = [
    ...new Set(
      [
        ...attendanceDocs.map((row) => String(row.eventId || "").trim()),
        ...registrationDocs.map((row) => String(row.eventId || "").trim()),
      ].filter(Boolean),
    ),
  ];

  const eventMeta = new Map<string, EventMeta>();
  if (eventIds.length) {
    const objectIds = eventIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (objectIds.length) {
      const events = await eventsCollection(db)
        .find({ _id: { $in: objectIds } })
        .project({
          startsAt: 1,
          endsAt: 1,
          status: 1,
          attendanceRequiredMinutes: 1,
          gracePeriodMinutes: 1,
        })
        .toArray();
      for (const event of events) {
        const id = String(event._id);
        eventMeta.set(id, {
          id,
          startsAt: String(event.startsAt || ""),
          endsAt: String(event.endsAt || ""),
          status: String(event.status || ""),
          requiredMinutes: Math.max(0, Number(event.attendanceRequiredMinutes || 0)),
          graceMinutes: Math.max(0, Number(event.gracePeriodMinutes || 15)),
        });
      }
    }
  }

  type Session = {
    eventId: string;
    tapInAt?: string;
    tapOutAt?: string;
    attendanceMinutes: number;
    qualified: boolean;
  };

  const sessions = new Map<string, Session>();
  for (const row of attendanceDocs) {
    const eventId = String(row.eventId || "").trim();
    if (!eventId) continue;
    const session = sessions.get(eventId) || {
      eventId,
      attendanceMinutes: 0,
      qualified: false,
    };
    const action = String(row.action || "in");
    const when = String(row.scannedAt || row.createdAt || "");
    if (action === "in") {
      if (!session.tapInAt) session.tapInAt = when;
    } else if (action === "out") {
      session.tapOutAt = when;
      session.attendanceMinutes = Math.max(
        session.attendanceMinutes,
        Number(row.attendanceMinutes || 0),
      );
      session.qualified = session.qualified || Boolean(row.qualifiedForCertificate);
    }
    sessions.set(eventId, session);
  }

  let attendanceCompleted = 0;
  let lateRecords = 0;
  let undertimeRecords = 0;
  let absences = 0;
  let eventsAttended = 0;
  let tapIns = 0;
  let tapOuts = 0;

  for (const session of sessions.values()) {
    if (session.tapInAt) {
      tapIns += 1;
      eventsAttended += 1;
    }
    if (session.tapOutAt) tapOuts += 1;

    const completed = Boolean(
      session.qualified ||
        (session.tapInAt && session.tapOutAt) ||
        session.attendanceMinutes > 0,
    );
    if (completed) attendanceCompleted += 1;

    const meta = eventMeta.get(session.eventId);
    if (session.tapInAt && meta?.startsAt) {
      const startMs = toMs(meta.startsAt);
      const tapMs = toMs(session.tapInAt);
      if (Number.isFinite(startMs) && Number.isFinite(tapMs)) {
        const lateAfter = startMs + meta.graceMinutes * 60_000;
        if (tapMs > lateAfter) lateRecords += 1;
      }
    }

    if (session.tapInAt) {
      const required = meta?.requiredMinutes || 0;
      const missingOut = !session.tapOutAt;
      const shortStay =
        required > 0 &&
        Boolean(session.tapOutAt) &&
        session.attendanceMinutes > 0 &&
        session.attendanceMinutes < required &&
        !session.qualified;
      if (missingOut || shortStay) undertimeRecords += 1;
    }
  }

  const registeredIds = [
    ...new Set(
      registrationDocs
        .map((row) => String(row.eventId || "").trim())
        .filter(Boolean),
    ),
  ];

  for (const eventId of registeredIds) {
    const session = sessions.get(eventId);
    if (session?.tapInAt) continue;
    const meta = eventMeta.get(eventId);
    const ended =
      meta?.status === "completed" ||
      meta?.status === "cancelled" ||
      (meta?.endsAt ? toMs(meta.endsAt) < Date.now() : false);
    // Count absences for finished events the user registered for but never tapped in.
    if (ended || meta?.status === "live" || meta?.status === "approved") {
      if (ended) absences += 1;
    }
  }

  const registrations = registeredIds.length;
  const attendanceRate = registrations
    ? Math.min(100, Math.round((eventsAttended / registrations) * 100))
    : eventsAttended > 0
      ? 100
      : 0;

  return {
    attendanceCompleted,
    lateRecords,
    undertimeRecords,
    absences,
    attendanceRate,
    eventsAttended,
    registrations,
    tapIns,
    tapOuts,
  };
}
