import { ObjectId } from "mongodb";
import { findEventById } from "@/lib/events/find-event";
import { usersCollection } from "@/lib/db/user-collections";
import { attendanceCollection } from "@/lib/user-server/activity";
import { registrationsCollection } from "@/lib/user-server/portal";
import { attendanceSecurityCollection } from "@/lib/user-server/attendance-security";
import { profileFromUserDoc } from "@/lib/user-server/record-attendance";

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

const MANILA_TZ = "Asia/Manila";

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
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA_TZ,
  });
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

function splitOrgRole(value?: string) {
  const raw = String(value || "").trim();
  if (!raw || raw === "—") return { role: "", position: "" };
  if (!raw.includes(":")) return { role: raw, position: "" };
  const [role, ...rest] = raw.split(":");
  return { role: role.trim(), position: rest.join(":").trim() };
}

function pickNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && text !== "—") return text;
  }
  return "";
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
  let attendanceMinutes = session?.attendanceMinutes || 0;
  // Older taps may lack attendanceMinutes — derive from first in → last out.
  if (attendanceMinutes <= 0 && tapInAt && tapOutAt) {
    const startMs = toMs(tapInAt);
    const endMs = toMs(tapOutAt);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      attendanceMinutes = Math.max(0, Math.round((endMs - startMs) / 60_000));
    }
  }
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
  } else if (tapInAt && tapOutAt) {
    statusLabel = "COMPLETE";
    attendanceStatusLabel =
      input.requiredMinutes > 0 ? "Attendance Requirement Met" : "Complete";
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

  // Events live in the admin DB after the split; registrations/taps stay in the user DB.
  const { event, userDb: db } = await findEventById(id);
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
    } else if (action === "out") {
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

  const emails = new Set<string>();
  for (const reg of registrations) {
    const email = normalizeEmail(String(reg.email || ""));
    if (email) emails.add(email);
  }
  for (const email of sessions.keys()) emails.add(email);

  const userDocs =
    emails.size > 0
      ? await usersCollection(db)
          .find({ email: { $in: [...emails] } })
          .project({
            email: 1,
            firstName: 1,
            lastName: 1,
            fullName: 1,
            name: 1,
            studentNumber: 1,
            course: 1,
            school: 1,
            organizationPart: 1,
            organization: 1,
            organizationRole: 1,
          })
          .limit(500)
          .toArray()
      : [];

  const profileByEmail = new Map(
    userDocs.map((user) => [
      normalizeEmail(String(user.email || "")),
      profileFromUserDoc(user as Record<string, unknown>),
    ]),
  );

  const participants: EventParticipantRow[] = [];
  const seen = new Set<string>();

  for (const reg of registrations) {
    const email = normalizeEmail(String(reg.email || ""));
    if (!email || seen.has(email)) continue;
    seen.add(email);

    const profile = profileByEmail.get(email);
    const regOrg = splitOrgRole(String(reg.organizationRole || ""));
    const session = sessions.get(email);
    const qualified = Boolean(session?.qualified);
    let certificateStatus = "INELIGIBLE";
    if (certByEmail.has(email)) certificateStatus = certByEmail.get(email) || "COMPLETE";
    else if (qualified) certificateStatus = "COMPLETE";
    else if (session?.tapInAt) certificateStatus = "INCOMPLETE";

    participants.push(
      buildParticipantRow({
        email,
        name: pickNonEmpty(
          String(reg.userName || ""),
          profile?.name,
          email,
        ),
        studentNumber: pickNonEmpty(
          String(reg.studentNumber || ""),
          profile?.studentNumber,
        ),
        course: pickNonEmpty(String(reg.course || ""), profile?.course),
        school: pickNonEmpty(String(reg.school || ""), profile?.school),
        organization: pickNonEmpty(
          String(reg.organization || ""),
          profile?.organization,
        ),
        organizationRole: pickNonEmpty(regOrg.role, profile?.organizationRole),
        organizationPosition: pickNonEmpty(
          String(reg.organizationPosition || ""),
          regOrg.position,
          profile?.organizationPosition,
        ),
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
    const profile = profileByEmail.get(email);
    const qualified = Boolean(session.qualified);
    let certificateStatus = "INELIGIBLE";
    if (certByEmail.has(email)) certificateStatus = certByEmail.get(email) || "COMPLETE";
    else if (qualified) certificateStatus = "COMPLETE";
    else if (session.tapInAt) certificateStatus = "INCOMPLETE";

    participants.push(
      buildParticipantRow({
        email,
        name: pickNonEmpty(
          String(attendanceName?.participantName || ""),
          String(attendanceName?.userName || ""),
          profile?.name,
          email,
        ),
        studentNumber: pickNonEmpty(
          String(attendanceName?.studentNumber || ""),
          profile?.studentNumber,
        ),
        course: pickNonEmpty(String(attendanceName?.course || ""), profile?.course),
        school: pickNonEmpty(String(attendanceName?.school || ""), profile?.school),
        organization: pickNonEmpty(
          String(attendanceName?.organization || ""),
          profile?.organization,
        ),
        organizationRole: pickNonEmpty(
          String(attendanceName?.organizationRole || ""),
          profile?.organizationRole,
        ),
        organizationPosition: pickNonEmpty(
          String(attendanceName?.organizationPosition || ""),
          profile?.organizationPosition,
        ),
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
