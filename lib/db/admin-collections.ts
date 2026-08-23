import type { Db } from "mongodb";
import type { SpaceEvent } from "@/lib/events/types";
import type { ActivityDoc } from "@/lib/user-server/activity";
import { ADMIN_DB_COLLECTIONS } from "@/lib/db/collections";

export function eventsCollection(db: Db) {
  return db.collection<SpaceEvent>(ADMIN_DB_COLLECTIONS.events);
}

export function activitiesCollection(db: Db) {
  return db.collection<ActivityDoc>(ADMIN_DB_COLLECTIONS.activities);
}

export function eventReportsCollection(db: Db) {
  return db.collection(ADMIN_DB_COLLECTIONS.eventReports);
}
