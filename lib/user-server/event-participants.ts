import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { attendanceCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { registrationsCollection } from "@/lib/user-server/portal";
import { attendanceSecurityCollection } from "@/lib/user-server/attendance-security";

export type EventParticipantFilters = {
  errors: boolean;
  manualOverride: boolean;
  onTime: boolean;
  completed: boolean;
  incomplete: boolean;
};

export type EventParticipantRow = {
  email: string;
  name: string;
  studentNumber: string;
  course: string;
  school: string;
  organization: string;
  organizationRole: string;
  organizationPosition: string;
  statusLabel: string;
  tapInLabel: string;
  tapOutLabel: string;
  durationLabel: string;
  attendanceStatusLabel: string;
  certificateStatus: string;
  filters: EventParticipantFilters;
};

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function toMs(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function formatClock(iso: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDurationMinutes(minutes: number) {
  if (minutes <= 0) return "0 MINS";
  if (minutes < 60) return `${minutes} MINS`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourLabel = hours === 1 ? "1 HR" : `${hours} HRS`;
  if (remainder === 0) return hourLabel;
  return `${hourLabel} ${remainder} MINS`;
}

type ParticipantSession = {
  tapInAt: string;
  tapOutAt: string;
  attendanceMinutes: number;
  qualified: boolean;
  manualSource: boolean;
};

function buildParticipantRow(input: {
  email: string;
  name: string;
  studentNumber: string;
  course: string;
  school: string;
  organization: string;
  organizationRole: string;
  organizationPosition: string;
  session?: ParticipantSession;
  security?: { errors: boolean; manualOverride: boolean };
  certificateStatus: string;
  graceMinutes: number;
  requiredMinutes: number;
  startsAt: string;
}): EventParticipantRow {
  const session = input.session;
  const security = input.security || { errors: false, manualOverride: false };
  const tapInAt = session?.tapInAt || "";
  const tapOutAt = session?.tapOutAt || "";
  const attendanceMinutes = session?.attendanceMinutes || 0;
  const qualified = Boolean(session?.qualified);

  const completed = Boolean(
    qualified || (tapInAt && tapOutAt) || attendanceMinutes > 0,
  );

  let onTime = false;
  if (tapInAt && input.startsAt) {
    const startMs = toMs(input.startsAt);
    const tapMs = toMs(tapInAt);
    if (Number.isFinite(startMs) && Number.isFinite(tapMs)) {
      onTime = tapMs <= startMs + input.graceMinutes * 60_000;
    }
  }

  const missingOut = Boolean(tapInAt && !tapOutAt);
  const shortStay =
    input.requiredMinutes > 0 &&
    Boolean(tapOutAt) &&
    attendanceMinutes > 0 &&
    attendanceMinutes < input.requiredMinutes &&
    !qualified;
  const late =
    Boolean(tapInAt && input.startsAt) &&
    !onTime &&
    Number.isFinite(toMs(input.startsAt)) &&
    Number.isFinite(toMs(tapInAt));

  let statusLabel = "ABSENT";
  let attendanceStatusLabel = "Absent";

  if (!tapInAt) {
    statusLabel = "ABSENT";
    attendanceStatusLabel = "Absent";
  } else if (qualified) {
    statusLabel = late ? "LATE" : "COMPLETE";
    attendanceStatusLabel = "Attendance Requirement Met";
  } else if (missingOut || shortStay) {
    statusLabel = missingOut ? "ATTENDANCE REQUIREMENT INCOMPLETE" : "UNDERTIME";
    attendanceStatusLabel = missingOut
      ? "Attendance Requirement Incomplete"
      : "Undertime";
  } else if (late) {
    statusLabel = "LATE";
    attendanceStatusLabel = "Late";
  } else {
    statusLabel = "INCOMPLETE";
    attendanceStatusLabel = "Incomplete";
  }

  const manualOverride = security.manualOverride || Boolean(session?.manualSource);
  const incomplete = !completed || missingOut || shortStay || !tapInAt;

  return {
    email: input.email,
    name: input.name,
    studentNumber: input.studentNumber || "—",
    course: input.course || "—",
    school: input.school || "—",
    organization: input.organization || "—",
    organizationRole: input.organizationRole || "—",
    organizationPosition: input.organizationPosition || "—",
    statusLabel,
    tapInLabel: tapInAt ? formatClock(tapInAt) : "—",
    tapOutLabel: tapOutAt ? formatClock(tapOutAt) : "—",
    durationLabel: formatDurationMinutes(attendanceMinutes),
    attendanceStatusLabel,
    certificateStatus: input.certificateStatus,
    filters: {
      errors: security.errors,
      manualOverride,
      onTime: Boolean(tapInAt && onTime),
      completed,
      incomplete,
    },
  };
}

/** Participant rows for admin attendance list (listp44) with filter flags. */
export async function buildEventParticipantList(eventId: string) {
  const id = String(eventId || "").trim();
  if (!id || !ObjectId.isValid(id)) {
    return { participants: [] as EventParticipantRow[] };
  }

  const db = await getUserDb();
  const event = await eventsCollection(db).findOne({ _id: new ObjectId(id) });
  if (!event) {
    return { participants: [] as EventParticipantRow[] };
  }

  const graceMinutes = Math.max(0, Number(event.gracePeriodMinutes || 15));
  const requiredMinutes = Math.max(0, Number(event.attendanceRequiredMinutes || 0));
  const startsAt = String(event.startsAt || "");

  const [registrations, attendanceDocs, securityDocs, certificates] = await Promise.all([
    registrationsCollection(db)
      .find({ eventId: id })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray(),
    attendanceCollection(db).find({ eventId: id }).sort({ createdAt: 1 }).limit(5000).toArray(),
    attendanceSecurityCollection(db).find({ eventId: id }).limit(2000).toArray(),
    db
      .collection("certificates")
      .find({ eventId: id })
      .project({ email: 1, status: 1 })
      .limit(500)
      .toArray(),
  ]);

  const securityByEmail = new Map<string, { errors: boolean; manualOverride: boolean }>();
  for (const row of securityDocs) {
    const email = normalizeEmail(String(row.email || ""));
    if (!email) continue;
    const entry = securityByEmail.get(email) || { errors: false, manualOverride: false };
    if (row.kind === "manual_override") entry.manualOverride = true;
    else entry.errors = true;
    securityByEmail.set(email, entry);
  }

  const sessions = new Map<string, ParticipantSession>();
  for (const row of attendanceDocs) {
    const email = normalizeEmail(String(row.email || ""));
    if (!email) continue;
    const session = sessions.get(email) || {
      tapInAt: "",
      tapOutAt: "",
      attendanceMinutes: 0,
      qualified: false,
      manualSource: false,
    };
    const action = String(row.action || "in");
    const when = String(row.scannedAt || row.createdAt || "");
    if (action === "in") {
      if (!session.tapInAt) session.tapInAt = when;
    } else {
      session.tapOutAt = when;
      session.attendanceMinutes = Math.max(
        session.attendanceMinutes,
        Number(row.attendanceMinutes || 0),
      );
      session.qualified = session.qualified || Boolean(row.qualifiedForCertificate);
    }
    const source = String(row.source || "");
    if (source && source !== "rfid" && source !== "session") {
      session.manualSource = true;
    }
    sessions.set(email, session);
  }

  const certByEmail = new Map<string, string>();
  for (const cert of certificates) {
    const email = normalizeEmail(String(cert.email || ""));
    if (!email) continue;
    certByEmail.set(email, String(cert.status || "generated").toUpperCase());
  }

  const participants: EventParticipantRow[] = [];
  const seen = new Set<string>();

  for (const reg of registrations) {
    const email = normalizeEmail(String(reg.email || ""));
    if (!email || seen.has(email)) continue;
    seen.add(email);

    const session = sessions.get(email);
    const qualified = Boolean(session?.qualified);
    let certificateStatus = "INELIGIBLE";
    if (certByEmail.has(email)) certificateStatus = certByEmail.get(email) || "COMPLETE";
    else if (qualified) certificateStatus = "COMPLETE";
    else if (session?.tapInAt) certificateStatus = "INCOMPLETE";

    participants.push(
      buildParticipantRow({
        email,
        name: String(reg.userName || reg.email || email),
        studentNumber: String(reg.studentNumber || ""),
        course: String(reg.course || ""),
        school: String(reg.school || ""),
        organization: String(reg.organization || ""),
        organizationRole: String(reg.organizationRole || ""),
        organizationPosition: String(reg.organizationRole || ""),
        session,
        security: securityByEmail.get(email),
        certificateStatus,
        graceMinutes,
        requiredMinutes,
        startsAt,
      }),
    );
  }

  for (const [email, session] of sessions) {
    if (seen.has(email)) continue;
    seen.add(email);

    const attendanceName = attendanceDocs.find(
      (row) => normalizeEmail(String(row.email || "")) === email,
    );
    const qualified = Boolean(session.qualified);
    let certificateStatus = "INELIGIBLE";
    if (certByEmail.has(email)) certificateStatus = certByEmail.get(email) || "COMPLETE";
    else if (qualified) certificateStatus = "COMPLETE";
    else if (session.tapInAt) certificateStatus = "INCOMPLETE";

    participants.push(
      buildParticipantRow({
        email,
        name: String(
          attendanceName?.participantName || attendanceName?.userName || email,
        ),
        studentNumber: String(attendanceName?.studentNumber || ""),
        course: String(attendanceName?.course || ""),
        school: "",
        organization: "—",
        organizationRole: "—",
        organizationPosition: "—",
        session,
        security: securityByEmail.get(email),
        certificateStatus,
        graceMinutes,
        requiredMinutes,
        startsAt,
      }),
    );
  }

  participants.sort((a, b) => a.name.localeCompare(b.name));
  return { participants };
}
