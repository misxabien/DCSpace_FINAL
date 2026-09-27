import type { Db, Document, Filter, Sort } from "mongodb";
import { ObjectId } from "mongodb";
import { eventsCollection, type SpaceEvent } from "@/lib/events/types";
import { getUserDb } from "@/lib/user-server/get-user-db";

/** User DB is canonical; admin DB may still hold older organizer submissions. */
export async function getEventsDatabases(): Promise<Db[]> {
  const userDb = await getUserDb();
  const adminName = process.env.MONGODB_ADMIN_DB_NAME?.trim();
  if (!adminName || adminName === userDb.databaseName) {
    return [userDb];
  }
  return [userDb, userDb.client.db(adminName)];
}

type EventDoc = SpaceEvent & { _id: ObjectId };

/** Exclude multi‑MB attachment blobs from list queries so cards load ASAP. */
export const EVENT_LIST_EXCLUDE_BLOBS = {
  posterImageBase64: 0,
  conceptPaperBase64: 0,
  certificateTemplateBase64: 0,
  programFileBase64: 0,
} as const;

/**
 * Inclusion projection for admin/organizer list cards — only the fields the
 * UI needs. Avoids pulling multi‑MB blobs or long text fields into the payload.
 */
export const EVENT_LIST_CARD_PROJECT = {
  title: 1,
  status: 1,
  location: 1,
  startsAt: 1,
  endsAt: 1,
  category: 1,
  department: 1,
  venueType: 1,
  organizerName: 1,
  organizerEmail: 1,
  organizerId: 1,
  reviewedByEmail: 1,
  reservationStatus: 1,
  reservationId: 1,
  reservationRoomName: 1,
  reservationCapacity: 1,
  createdAt: 1,
  updatedAt: 1,
  submittedByPortal: 1,
  attendanceRequired: 1,
  attendanceRequiredMinutes: 1,
  gracePeriod: 1,
} as const;

function dedupeById(docs: EventDoc[]): EventDoc[] {
  const map = new Map<string, EventDoc>();
  for (const doc of docs) {
    const id = String(doc._id);
    // Prefer the first DB in order (user/canonical).
    if (!map.has(id)) map.set(id, doc);
  }
  return Array.from(map.values());
}

/** Load events across user + admin Mongo DBs (deduped by _id). */
export async function findEventsAcrossDatabases(
  filter: Filter<Document> = {},
  options?: {
    sort?: Sort;
    limit?: number;
    /** When true (default), skip multi‑MB attachment blobs for fast lists. */
    lean?: boolean;
    /** Prefer slim card fields (default true when lean). */
    cardFields?: boolean;
  },
): Promise<EventDoc[]> {
  const dbs = await getEventsDatabases();
  const sort = options?.sort || { updatedAt: -1 };
  const limit = Math.min(Math.max(options?.limit || 100, 1), 500);
  const perDbLimit = Math.min(limit * 2, 1000);
  const lean = options?.lean !== false;
  const cardFields = options?.cardFields ?? lean;
  const project = cardFields
    ? EVENT_LIST_CARD_PROJECT
    : lean
      ? EVENT_LIST_EXCLUDE_BLOBS
      : null;

  const batches = await Promise.all(
    dbs.map(async (db) => {
      try {
        // Project BEFORE sort so Mongo never materializes multi‑MB attachment
        // blobs into the 32MB in-memory sort buffer.
        if (project) {
          const docs = await eventsCollection(db)
            .aggregate(
              [
                { $match: filter as Document },
                { $project: project as Document },
                { $sort: sort as Document },
                { $limit: perDbLimit },
              ],
              { allowDiskUse: true },
            )
            .toArray();
          return docs as EventDoc[];
        }
        return (await eventsCollection(db)
          .find(filter)
          .sort(sort)
          .limit(perDbLimit)
          .toArray()) as EventDoc[];
      } catch (error) {
        console.warn(
          `[DC Space] events query failed for db=${db.databaseName}:`,
          error instanceof Error ? error.message : error,
        );
        return [] as EventDoc[];
      }
    }),
  );

  const merged = dedupeById(batches.flat());
  merged.sort((a, b) => {
    const aKey = String(a.updatedAt || a.createdAt || "");
    const bKey = String(b.updatedAt || b.createdAt || "");
    return bKey.localeCompare(aKey);
  });
  return merged.slice(0, limit);
}

/** Find one event by id in user DB first, then admin DB (parallel). */
export async function findEventByIdAcrossDatabases(
  id: string,
  options?: { includeBlobs?: boolean },
): Promise<{ db: Db; doc: EventDoc } | null> {
  if (!ObjectId.isValid(id)) return null;
  const objectId = new ObjectId(id);
  const dbs = await getEventsDatabases();
  const includeBlobs = options?.includeBlobs === true;
  const hits = await Promise.all(
    dbs.map(async (db) => {
      const doc = (
        includeBlobs
          ? await eventsCollection(db).findOne({ _id: objectId })
          : await eventsCollection(db).findOne(
              { _id: objectId },
              { projection: EVENT_LIST_EXCLUDE_BLOBS },
            )
      ) as EventDoc | null;
      return doc ? { db, doc } : null;
    }),
  );
  // Prefer user DB (canonical) when both have a copy.
  return hits.find(Boolean) || null;
}
