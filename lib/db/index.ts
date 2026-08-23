export {
  USER_DB_COLLECTIONS,
  ADMIN_DB_COLLECTIONS,
  LEGACY_USER_DB_COLLECTIONS,
  LEGACY_ADMIN_IN_USER_DB,
} from "@/lib/db/collections";

export { getUserDb, getAdminDb } from "@/lib/db/get-db";

export {
  usersCollection,
  savedEventsCollection,
  registrationsCollection,
  invitationsCollection,
  notificationsCollection,
  attendanceCollection,
  feedbackCollection,
  certificatesCollection,
  emailVerificationsCollection,
  eventGalleryCollection,
} from "@/lib/db/user-collections";

export {
  eventsCollection,
  activitiesCollection,
  eventReportsCollection,
} from "@/lib/db/admin-collections";
