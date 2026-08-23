import { getAdminDb } from "@/lib/db/get-db";
import {
  activitiesCollection,
  eventsCollection,
} from "@/lib/db/admin-collections";

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

export { activitiesCollection, eventsCollection };

export {
  attendanceCollection,
  certificatesCollection,
  feedbackCollection,
} from "@/lib/db/user-collections";

/** Best-effort activity log — never blocks the main request path. */
export async function logUserActivity(
  input: Omit<ActivityDoc, "createdAt"> & { createdAt?: string },
) {
  try {
    const db = await getAdminDb();
    await activitiesCollection(db).insertOne({
      ...input,
      createdAt: input.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.warn("[DC Space] Failed to log activity:", details);
  }
}
