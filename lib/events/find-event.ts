import { ObjectId, type Db } from "mongodb";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { eventsCollection, type SpaceEvent } from "@/lib/events/types";
import { EVENT_LIST_PROJECTION, attachmentKindProjection } from "@/lib/events/list-projection";
import { isPublicEventStatus } from "@/lib/events/public-status";

export type EventDoc = SpaceEvent & { _id: ObjectId };

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  pending: 1,
  rejected: 2,
  postponed: 3,
  cancelled: 4,
  approved: 5,
  live: 6,
  completed: 7,
};

function statusRank(status?: string | null) {
  return STATUS_RANK[String(status || "").toLowerCase()] ?? 0;
}

/** Merge two DB copies; prefer the more advanced lifecycle status + any attachments. */
export function mergeEventDocs(primary: EventDoc, secondary: EventDoc | null): EventDoc {
  if (!secondary) return primary;

  // Prefer the copy that has moved further through approval / live / completed.
  const preferSecondary = statusRank(secondary.status) > statusRank(primary.status);
  const base = preferSecondary ? secondary : primary;
  const other = preferSecondary ? primary : secondary;
  const merged: EventDoc = { ...other, ...base };

  // Keep attachment blobs from whichever copy still has them.
  if (!merged.posterImageBase64 && other.posterImageBase64) {
    merged.posterImageBase64 = other.posterImageBase64;
    merged.posterImageMimeType =
      other.posterImageMimeType || merged.posterImageMimeType || "image/jpeg";
    merged.hasPoster = true;
  }
  if (!merged.conceptPaperBase64 && other.conceptPaperBase64) {
    merged.conceptPaperBase64 = other.conceptPaperBase64;
    merged.conceptPaperMimeType =
      other.conceptPaperMimeType || merged.conceptPaperMimeType;
    merged.conceptPaperName = other.conceptPaperName || merged.conceptPaperName;
  }
  if (!merged.programFileBase64 && other.programFileBase64) {
    merged.programFileBase64 = other.programFileBase64;
    merged.programFileMimeType =
      other.programFileMimeType || merged.programFileMimeType;
    merged.programFileName = other.programFileName || merged.programFileName;
  }
  if (!merged.certificateTemplateBase64 && other.certificateTemplateBase64) {
    merged.certificateTemplateBase64 = other.certificateTemplateBase64;
    merged.certificateTemplateMimeType =
      other.certificateTemplateMimeType || merged.certificateTemplateMimeType;
    merged.certificateTemplateName =
      other.certificateTemplateName || merged.certificateTemplateName;
  }

  // Never let a stale pending admin copy hide a live/approved student copy.
  if (isPublicEventStatus(other.status) && !isPublicEventStatus(merged.status)) {
    merged.status = other.status;
  }
  if (
    (!merged.reservationStatus || merged.reservationStatus === "pending") &&
    other.reservationStatus &&
    other.reservationStatus !== "pending"
  ) {
    merged.reservationStatus = other.reservationStatus;
    merged.reservationRoomName =
      other.reservationRoomName || merged.reservationRoomName;
    merged.reservationCapacity =
      other.reservationCapacity ?? merged.reservationCapacity;
  }

  return merged;
}

/** Prefer admin DB (canonical), fall back to user DB for pre-merge events. */
export async function findEventById(
  id: string,
  options?: { includeBlobs?: boolean },
): Promise<{
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
  const includeBlobs = options?.includeBlobs === true;
  const findOpts = includeBlobs
    ? undefined
    : { projection: EVENT_LIST_PROJECTION };
  const [fromAdmin, fromUser] = await Promise.all([
    eventsCollection(adminDb).findOne({ _id: oid }, findOpts),
    eventsCollection(userDb).findOne({ _id: oid }, findOpts),
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

/** Load only the blob fields for one attachment kind (fast poster/PDF downloads). */
export async function findEventAttachmentById(
  id: string,
  kind: string,
): Promise<{
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
  const projection = attachmentKindProjection(kind);
  const [fromAdmin, fromUser] = await Promise.all([
    eventsCollection(adminDb).findOne({ _id: oid }, { projection }),
    eventsCollection(userDb).findOne({ _id: oid }, { projection }),
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
  options?: { projection?: Record<string, 0 | 1> },
): Promise<EventDoc[]> {
  const [adminDb, userDb] = await Promise.all([getAdminDb(), getUserDb()]);
  const projection = options?.projection || EVENT_LIST_PROJECTION;
  const list = (db: Db) =>
    eventsCollection(db)
      .find(filter, { projection })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

  const [adminDocs, userDocs] = await Promise.all([list(adminDb), list(userDb)]);

  const byId = new Map<string, EventDoc>();
  for (const doc of userDocs) {
    byId.set(String(doc._id), doc as EventDoc);
  }
  for (const doc of adminDocs) {
    const id = String(doc._id);
    const existing = byId.get(id);
    byId.set(id, existing ? mergeEventDocs(doc as EventDoc, existing) : (doc as EventDoc));
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
  const findOpts = { projection: EVENT_LIST_PROJECTION };
  const [adminDocs, userDocs] = await Promise.all([
    eventsCollection(adminDb).find({ _id: { $in: objectIds } }, findOpts).toArray(),
    eventsCollection(userDb).find({ _id: { $in: objectIds } }, findOpts).toArray(),
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
