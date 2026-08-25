import { ObjectId, type Db } from "mongodb";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { eventsCollection, type SpaceEvent } from "@/lib/events/types";

export type EventDoc = SpaceEvent & { _id: ObjectId };

function mergeEventDocs(primary: EventDoc, secondary: EventDoc | null): EventDoc {
  if (!secondary) return primary;
  const merged: EventDoc = { ...secondary, ...primary };
  // Keep attachment blobs from whichever copy still has them.
  if (!merged.posterImageBase64 && secondary.posterImageBase64) {
    merged.posterImageBase64 = secondary.posterImageBase64;
    merged.posterImageMimeType =
      secondary.posterImageMimeType || merged.posterImageMimeType || "image/jpeg";
    merged.hasPoster = true;
  }
  if (!merged.conceptPaperBase64 && secondary.conceptPaperBase64) {
    merged.conceptPaperBase64 = secondary.conceptPaperBase64;
    merged.conceptPaperMimeType =
      secondary.conceptPaperMimeType || merged.conceptPaperMimeType;
    merged.conceptPaperName = secondary.conceptPaperName || merged.conceptPaperName;
  }
  if (!merged.programFileBase64 && secondary.programFileBase64) {
    merged.programFileBase64 = secondary.programFileBase64;
    merged.programFileMimeType =
      secondary.programFileMimeType || merged.programFileMimeType;
    merged.programFileName = secondary.programFileName || merged.programFileName;
  }
  if (!merged.certificateTemplateBase64 && secondary.certificateTemplateBase64) {
    merged.certificateTemplateBase64 = secondary.certificateTemplateBase64;
    merged.certificateTemplateMimeType =
      secondary.certificateTemplateMimeType || merged.certificateTemplateMimeType;
    merged.certificateTemplateName =
      secondary.certificateTemplateName || merged.certificateTemplateName;
  }
  return merged;
}

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
  const [fromAdmin, fromUser] = await Promise.all([
    eventsCollection(adminDb).findOne({ _id: oid }),
    eventsCollection(userDb).findOne({ _id: oid }),
  ]);

  if (fromAdmin) {
    return {
      event: mergeEventDocs(fromAdmin as EventDoc, (fromUser as EventDoc) || null),
      adminDb,
      userDb,
      source: "admin",
    };
  }
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
  const [adminDocs, userDocs] = await Promise.all([
    eventsCollection(adminDb).find({ _id: { $in: objectIds } }).toArray(),
    eventsCollection(userDb).find({ _id: { $in: objectIds } }).toArray(),
  ]);

  const userById = new Map(userDocs.map((doc) => [String(doc._id), doc as EventDoc]));
  const merged = adminDocs.map((doc) =>
    mergeEventDocs(doc as EventDoc, userById.get(String(doc._id)) || null),
  );
  const adminIds = new Set(merged.map((doc) => String(doc._id)));
  for (const doc of userDocs) {
    if (!adminIds.has(String(doc._id))) merged.push(doc as EventDoc);
  }
  return merged;
}
