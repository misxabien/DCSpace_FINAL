import { ObjectId, type Db } from "mongodb";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { eventsCollection, type SpaceEvent } from "@/lib/events/types";

export type EventDoc = SpaceEvent & { _id: ObjectId };

/** Prefer admin DB (canonical), fall back to user DB for pre-merge events. */
export async function findEventById(id: string): Promise<{
  event: EventDoc | null;
  adminDb: Db;
  userDb: Db;
  source: "admin" | "user" | null;
}> {
  const [adminDb, userDb] = await Promise.all([getAdminDb(), getUserDb()]);
  if (!ObjectId.isValid(id)) {
    return { event: null, adminDb, userDb, source: null };
  }
  const oid = new ObjectId(id);
  const fromAdmin = await eventsCollection(adminDb).findOne({ _id: oid });
  if (fromAdmin) {
    return { event: fromAdmin as EventDoc, adminDb, userDb, source: "admin" };
  }
  const fromUser = await eventsCollection(userDb).findOne({ _id: oid });
  if (fromUser) {
    return { event: fromUser as EventDoc, adminDb, userDb, source: "user" };
  }
  return { event: null, adminDb, userDb, source: null };
}

/** Merge organizer events from admin + user DBs (admin wins on id collision). */
export async function findOrganizerEvents(
  filter: Record<string, unknown>,
  limit = 200,
): Promise<EventDoc[]> {
  const [adminDb, userDb] = await Promise.all([getAdminDb(), getUserDb()]);
  const [adminDocs, userDocs] = await Promise.all([
    eventsCollection(adminDb).find(filter).sort({ updatedAt: -1 }).limit(limit).toArray(),
    eventsCollection(userDb).find(filter).sort({ updatedAt: -1 }).limit(limit).toArray(),
  ]);

  const byId = new Map<string, EventDoc>();
  for (const doc of userDocs) {
    byId.set(String(doc._id), doc as EventDoc);
  }
  for (const doc of adminDocs) {
    byId.set(String(doc._id), doc as EventDoc);
  }

  return [...byId.values()].sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
  );
}

/** Load many events by id from admin first, then user DB for misses. */
export async function findEventsByIds(ids: string[]): Promise<EventDoc[]> {
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  const objectIds = unique.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (!objectIds.length) return [];

  const [adminDb, userDb] = await Promise.all([getAdminDb(), getUserDb()]);
  const adminDocs = await eventsCollection(adminDb)
    .find({ _id: { $in: objectIds } })
    .toArray();
  const found = new Set(adminDocs.map((doc) => String(doc._id)));
  const missing = objectIds.filter((id) => !found.has(String(id)));
  const userDocs = missing.length
    ? await eventsCollection(userDb).find({ _id: { $in: missing } }).toArray()
    : [];

  return [...adminDocs, ...userDocs] as EventDoc[];
}
