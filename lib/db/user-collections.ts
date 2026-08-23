import type { Db } from "mongodb";
import { USER_DB_COLLECTIONS } from "@/lib/db/collections";

export function usersCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.users);
}

export function savedEventsCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.savedEvents);
}

export function registrationsCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.registrations);
}

export function invitationsCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.invitations);
}

export function notificationsCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.notifications);
}

export function attendanceCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.attendance);
}

export function feedbackCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.feedback);
}

export function certificatesCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.certificates);
}

export function emailVerificationsCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.emailVerifications);
}

export function eventGalleryCollection(db: Db) {
  return db.collection(USER_DB_COLLECTIONS.eventGallery);
}
