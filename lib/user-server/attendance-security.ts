import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { attendanceCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";

/** Categories shown under Attendance Security → Suspicious Scanning Behavior. */
export type AttendanceSecurityKind =
  | "duplicate_warning"
  | "duplicate_entry"
  | "rapid_consecutive"
  | "invalid_scan"
  | "concurrent_event"
  | "manual_override";

export type AttendanceSecurityEvent = {
  eventId: string;
  kind: AttendanceSecurityKind;
  code: string;
  message: string;
  rfidNumber?: string;
  email?: string;
  participantName?: string;
  requestedAction?: "in" | "out";
  actorEmail?: string;
  actorName?: string;
  /** Other event involved in a concurrent-event conflict. */
  relatedEventId?: string;
  relatedEventTitle?: string;
  createdAt: string;
};

export function attendanceSecurityCollection(db: Db) {
  return db.collection<AttendanceSecurityEvent>("attendance_security_events");
}

export async function logAttendanceSecurityEvent(
  input: Omit<AttendanceSecurityEvent, "createdAt"> & { createdAt?: string },
) {
  try {
    const db = await getUserDb();
    await attendanceSecurityCollection(db).insertOne({
      ...input,
      eventId: String(input.eventId || "").trim(),
      kind: input.kind,
      code: String(input.code || input.kind),
      message: String(input.message || "").trim(),
      rfidNumber: String(input.rfidNumber || "").trim() || undefined,
      email: String(input.email || "").trim().toLowerCase() || undefined,
      participantName: String(input.participantName || "").trim() || undefined,
      requestedAction: input.requestedAction,
      actorEmail: String(input.actorEmail || "").trim().toLowerCase() || undefined,
      actorName: String(input.actorName || "").trim() || undefined,
      relatedEventId: String(input.relatedEventId || "").trim() || undefined,
      relatedEventTitle: String(input.relatedEventTitle || "").trim() || undefined,
      createdAt: input.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.warn("[DC Space] Failed to log attendance security event:", details);
  }
}

export function securityKindFromCode(code: string): AttendanceSecurityKind {
  const normalized = String(code || "").toLowerCase();
  if (normalized === "duplicate_warning") return "duplicate_warning";
  if (normalized === "rapid_consecutive") return "rapid_consecutive";
  if (normalized === "duplicate_entry") return "duplicate_entry";
  if (normalized === "concurrent_event") return "concurrent_event";
  if (normalized === "manual_override") return "manual_override";
  return "invalid_scan";
}

/** Duplicate tap-in attempts for this participant at this event (recent desk session). */
export async function countPriorDuplicateAttempts(
  db: Db,
  eventId: string,
  email: string,
) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  return attendanceSecurityCollection(db).countDocuments({
    eventId: String(eventId || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    kind: { $in: ["duplicate_warning", "duplicate_entry"] },
    createdAt: { $gte: since },
  });
}

const CONCURRENT_EVENT_WINDOW_MS = 60_000;

/**
 * Student tapped in at another event within the last minute and is still inside there.
 */
export async function findConcurrentEventConflict(
  db: Db,
  email: string,
  currentEventId: string,
): Promise<{ eventId: string; eventTitle: string; tappedAt: string } | null> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const currentId = String(currentEventId || "").trim();
  if (!normalizedEmail || !currentId) return null;

  const cutoff = Date.now() - CONCURRENT_EVENT_WINDOW_MS;
  const recentIns = await attendanceCollection(db)
    .find({ email: normalizedEmail, action: "in", eventId: { $ne: currentId } })
    .sort({ createdAt: -1 })
    .limit(25)
    .toArray();

  for (const tapIn of recentIns) {
    const otherEventId = String(tapIn.eventId || "").trim();
    if (!otherEventId) continue;

    const tappedAt = String(tapIn.scannedAt || tapIn.createdAt || "");
    const tappedMs = new Date(tappedAt).getTime();
    if (!Number.isFinite(tappedMs) || tappedMs < cutoff) continue;

    const later = await attendanceCollection(db)
      .find({
        eventId: otherEventId,
        email: normalizedEmail,
        createdAt: { $gt: tapIn.createdAt },
      })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();

    if (later && String(later.action) === "out") continue;

    const event = ObjectId.isValid(otherEventId)
      ? await eventsCollection(db).findOne(
          { _id: new ObjectId(otherEventId) },
          { projection: { title: 1 } },
        )
      : null;

    return {
      eventId: otherEventId,
      eventTitle: String(event?.title || "another event"),
      tappedAt,
    };
  }

  return null;
}

export async function loadAttendanceSecurityStats(eventId: string) {
  const id = String(eventId || "").trim();
  if (!id) {
    return {
      duplicateScans: 0,
      duplicateWarnings: 0,
      rapidConsecutiveScans: 0,
      invalidScans: 0,
      concurrentEventTaps: 0,
      manualOverrideCount: 0,
      totalSecurityEvents: 0,
      securityRisk: "Low" as const,
      recentEvents: [] as Array<{
        id: string;
        kind: AttendanceSecurityKind;
        code: string;
        message: string;
        participantName: string;
        rfidNumber: string;
        requestedAction: string;
        createdAt: string;
      }>,
    };
  }

  const db = await getUserDb();
  const col = attendanceSecurityCollection(db);

  const [
    duplicateScans,
    duplicateWarnings,
    rapidConsecutiveScans,
    invalidScans,
    concurrentEventTaps,
    manualOverrideCount,
    recent,
  ] = await Promise.all([
    col.countDocuments({ eventId: id, kind: "duplicate_entry" }),
    col.countDocuments({ eventId: id, kind: "duplicate_warning" }),
    col.countDocuments({ eventId: id, kind: "rapid_consecutive" }),
    col.countDocuments({ eventId: id, kind: "invalid_scan" }),
    col.countDocuments({ eventId: id, kind: "concurrent_event" }),
    col.countDocuments({ eventId: id, kind: "manual_override" }),
    col
      .find({ eventId: id })
      .sort({ createdAt: -1 })
      .limit(12)
      .toArray(),
  ]);

  const totalSecurityEvents =
    duplicateScans +
    rapidConsecutiveScans +
    invalidScans +
    concurrentEventTaps +
    manualOverrideCount;

  let securityRisk: "Low" | "Moderate" | "High" = "Low";
  if (
    concurrentEventTaps >= 1 ||
    duplicateScans >= 3 ||
    invalidScans >= 3 ||
    totalSecurityEvents >= 8
  ) {
    securityRisk = "High";
  } else if (
    duplicateScans >= 1 ||
    invalidScans >= 1 ||
    rapidConsecutiveScans >= 2 ||
    duplicateWarnings >= 2
  ) {
    securityRisk = "Moderate";
  }

  return {
    duplicateScans,
    duplicateWarnings,
    rapidConsecutiveScans,
    invalidScans,
    concurrentEventTaps,
    manualOverrideCount,
    totalSecurityEvents,
    securityRisk,
    recentEvents: recent.map((row) => ({
      id: String(row._id || ""),
      kind: row.kind,
      code: String(row.code || row.kind),
      message: String(row.message || ""),
      participantName: String(row.participantName || row.email || "Unknown"),
      rfidNumber: String(row.rfidNumber || ""),
      requestedAction: String(row.requestedAction || ""),
      createdAt: String(row.createdAt || ""),
    })),
  };
}

export function securityKindLabel(kind: AttendanceSecurityKind) {
  switch (kind) {
    case "duplicate_warning":
    case "duplicate_entry":
      return "Duplicate entry";
    case "rapid_consecutive":
      return "Multiple taps";
    case "concurrent_event":
      return "Attending two events";
    case "manual_override":
      return "Manual override";
    default:
      return "Invalid scan";
  }
}
