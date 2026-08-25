import type { Db } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";

export type ActivityType =
  | "user_registered"
  | "user_login"
  | "event_submitted"
  | "event_approved"
  | "event_rejected"
  | "event_live"
  | "event_completed"
  | "event_postponed"
  | "attendance_recorded"
  | "feedback_submitted"
  | "certificate_generated";

export type ActivityDoc = {
  type: ActivityType;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  targetId?: string;
  targetTitle?: string;
  organization?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
};

export function activitiesCollection(db: Db) {
  return db.collection<ActivityDoc>("user_activities");
}

export function attendanceCollection(db: Db) {
  return db.collection("attendance_records");
}

export function feedbackCollection(db: Db) {
  return db.collection("feedback_entries");
}

export function certificatesCollection(db: Db) {
  return db.collection("certificates");
}

/** Best-effort activity log — never blocks the main request path. */
export async function logUserActivity(
  input: Omit<ActivityDoc, "createdAt"> & { createdAt?: string },
) {
  try {
    const db = await getUserDb();
    await activitiesCollection(db).insertOne({
      ...input,
      createdAt: input.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.warn("[DC Space] Failed to log activity:", details);
  }
}
