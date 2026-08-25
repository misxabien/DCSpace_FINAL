import type { Db, ObjectId } from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";

export type EventGalleryPhotoDoc = {
  _id?: ObjectId;
  eventId: string;
  dataUrl: string;
  uploadedByEmail?: string;
  createdAt: string;
  archived?: boolean;
  archivedAt?: string;
  archivedByEmail?: string;
  source?: "admin" | "organizer";
  caption?: string;
};

export function eventGalleryCollection(db: Db) {
  return db.collection<EventGalleryPhotoDoc>("event_gallery");
}

export function sanitizeGalleryPhoto(
  doc: EventGalleryPhotoDoc & { _id?: ObjectId },
) {
  return {
    id: String(doc._id || ""),
    dataUrl: String(doc.dataUrl || ""),
    uploadedAt: String(doc.createdAt || ""),
    uploadedByEmail: String(doc.uploadedByEmail || ""),
    archived: Boolean(doc.archived),
    archivedAt: String(doc.archivedAt || ""),
    source: (doc.source === "admin" ? "admin" : "organizer") as "admin" | "organizer",
    caption: String(doc.caption || ""),
  };
}

export async function listEventGalleryPhotos(
  db: Db,
  eventId: string,
  options?: { includeArchived?: boolean; limit?: number },
) {
  const filter: Record<string, unknown> = { eventId };
  if (!options?.includeArchived) {
    filter.archived = { $ne: true };
  }
  const docs = await eventGalleryCollection(db)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 80)
    .toArray();
  return docs.map((doc) => sanitizeGalleryPhoto(doc as EventGalleryPhotoDoc & { _id?: ObjectId }));
}

export async function insertEventGalleryPhoto(
  db: Db,
  input: {
    eventId: string;
    dataUrl: string;
    uploadedByEmail: string;
    source: "admin" | "organizer";
    caption?: string;
  },
) {
  const now = new Date().toISOString();
  const doc: EventGalleryPhotoDoc = {
    eventId: input.eventId,
    dataUrl: input.dataUrl,
    uploadedByEmail: input.uploadedByEmail.trim().toLowerCase(),
    createdAt: now,
    archived: false,
    source: input.source,
    caption: input.caption || "",
  };
  const result = await eventGalleryCollection(db).insertOne(doc);
  return sanitizeGalleryPhoto({ ...doc, _id: result.insertedId });
}

export async function setEventGalleryPhotoArchived(
  db: Db,
  input: {
    eventId: string;
    photoId: string;
    archived: boolean;
    archivedByEmail: string;
  },
) {
  if (!MongoObjectId.isValid(input.photoId)) return null;
  const now = new Date().toISOString();
  const update = input.archived
    ? {
        archived: true,
        archivedAt: now,
        archivedByEmail: input.archivedByEmail.trim().toLowerCase(),
      }
    : {
        archived: false,
        archivedAt: "",
        archivedByEmail: "",
      };
  const result = await eventGalleryCollection(db).findOneAndUpdate(
    { _id: new MongoObjectId(input.photoId), eventId: input.eventId },
    { $set: update },
    { returnDocument: "after" },
  );
  if (!result) return null;
  return sanitizeGalleryPhoto(result as EventGalleryPhotoDoc & { _id?: ObjectId });
}
