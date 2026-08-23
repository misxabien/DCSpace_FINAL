/**
 * MongoDB collection registry — every collection belongs to either the user or admin database.
 *
 * User DB (MONGODB_DB_NAME, default dcspace_user): student/organizer portal data
 * Admin DB (MONGODB_ADMIN_DB_NAME, default dcspace_admin): events lifecycle + audit logs
 */

export const USER_DB_COLLECTIONS = {
  users: "users",
  savedEvents: "saved_events",
  registrations: "event_registrations",
  invitations: "event_invitations",
  notifications: "notifications",
  attendance: "attendance_records",
  feedback: "feedback_entries",
  certificates: "certificates",
  emailVerifications: "email_verifications",
  eventGallery: "event_gallery",
} as const;

export const ADMIN_DB_COLLECTIONS = {
  events: "events",
  activities: "user_activities",
  eventReports: "event_reports",
} as const;

export type UserDbCollection = (typeof USER_DB_COLLECTIONS)[keyof typeof USER_DB_COLLECTIONS];
export type AdminDbCollection = (typeof ADMIN_DB_COLLECTIONS)[keyof typeof ADMIN_DB_COLLECTIONS];

/** Legacy collection names that lived in the user DB before the split. */
export const LEGACY_USER_DB_COLLECTIONS = ["bookmarks", "user_notifications"] as const;

/** Admin collections that may still exist in the user DB until migration runs. */
export const LEGACY_ADMIN_IN_USER_DB = [
  ADMIN_DB_COLLECTIONS.events,
  ADMIN_DB_COLLECTIONS.activities,
  ADMIN_DB_COLLECTIONS.eventReports,
] as const;
