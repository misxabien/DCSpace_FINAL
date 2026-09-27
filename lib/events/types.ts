import type { Db, ObjectId } from "mongodb";

export type EventStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "postponed"
  | "live"
  | "completed"
  | "cancelled";

export type SpaceEvent = {
  _id?: ObjectId;
  title: string;
  description?: string;
  category?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  attendanceRequired?: string;
  attendanceRequiredMinutes?: number;
  gracePeriod?: string;
  gracePeriodMinutes?: number;
  certificateTemplateName?: string;
  certificateTemplateMimeType?: string;
  certificateTemplateBase64?: string;
  conceptPaperName?: string;
  conceptPaperMimeType?: string;
  conceptPaperBase64?: string;
  programFileName?: string;
  programFileMimeType?: string;
  programFileBase64?: string;
  programFileVisibility?: "everyone" | "organizers";
  venueType?: string;
  announcements?: string;
  allowedCourses?: string[];
  requiredFiles?: string[];
  speakers?: string[];
  collaboratingDepartments?: string[];
  audienceSchools?: string[];
  programActivities?: string[];
  department?: string;
  posterImageBase64?: string;
  posterImageMimeType?: string;
  status: EventStatus;
  organizerId?: string;
  organizerEmail?: string;
  organizerName?: string;
  submittedByPortal?: "user" | "admin";
  reviewedByEmail?: string;
  reviewNote?: string;
  /** Linked eRoomReserve reservation id (synced via /api/integrations/reservation-info). */
  reservationId?: string;
  reservationStatus?: string;
  reservationRoomId?: string;
  reservationRoomName?: string;
  reservationCapacity?: number;
  /** Faculty adviser email for Main Campus student on-campus events. */
  advisorEmail?: string;
  /** Last outbound eRoomReserve sync error (if any). */
  reservationSyncError?: string;
  reservationSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function eventsCollection(db: Db) {
  return db.collection<SpaceEvent>("events");
}

/** Slim card payload for admin/organizer event lists (fast JSON). */
export function sanitizeEventListCard(doc: SpaceEvent & { _id: ObjectId }) {
  const id = doc._id?.toString?.() || String(doc._id || "");
  return {
    id,
    title: String(doc.title || "Untitled event"),
    status: String(doc.status || ""),
    location: String(doc.location || ""),
    startsAt: String(doc.startsAt || ""),
    endsAt: String(doc.endsAt || ""),
    category: String(doc.category || ""),
    department: String(doc.department || ""),
    venueType: String(doc.venueType || ""),
    organizerName: String(doc.organizerName || ""),
    organizerEmail: String(doc.organizerEmail || ""),
    reservationStatus: String(doc.reservationStatus || ""),
    reservationId: String(doc.reservationId || ""),
    reservationRoomName: String(doc.reservationRoomName || ""),
    attendanceRequiredMinutes: Number(doc.attendanceRequiredMinutes || 0),
    createdAt: String(doc.createdAt || ""),
    updatedAt: String(doc.updatedAt || ""),
  };
}

export function sanitizeEvent(
  doc: SpaceEvent & { _id: ObjectId },
  options?: { includeMedia?: boolean },
) {
  const id = doc._id.toString();
  // When list/detail queries exclude base64 blobs, fall back to name/mime flags
  // so attachment links still resolve via /api/events/:id/attachments/*.
  const hasPoster = Boolean(doc.posterImageBase64) || Boolean(doc.posterImageMimeType);
  const hasConceptPaper =
    Boolean(doc.conceptPaperBase64) || Boolean(doc.conceptPaperName);
  const hasCertificateTemplate =
    Boolean(doc.certificateTemplateBase64) || Boolean(doc.certificateTemplateName);
  const hasProgramFile =
    Boolean(doc.programFileBase64) || Boolean(doc.programFileName);

  return {
    id,
    title: doc.title,
    description: doc.description || "",
    category: doc.category || "",
    location: doc.location || "",
    startsAt: doc.startsAt || "",
    endsAt: doc.endsAt || "",
    attendanceRequired: doc.attendanceRequired || "",
    attendanceRequiredMinutes: Number(doc.attendanceRequiredMinutes || 0),
    gracePeriod: doc.gracePeriod || "",
    gracePeriodMinutes: Number(doc.gracePeriodMinutes || 0),
    certificateTemplateName: doc.certificateTemplateName || "",
    certificateTemplateMimeType: doc.certificateTemplateMimeType || "",
    conceptPaperName: doc.conceptPaperName || "",
    conceptPaperMimeType: doc.conceptPaperMimeType || "",
    programFileName: doc.programFileName || "",
    programFileMimeType: doc.programFileMimeType || "",
    programFileVisibility: doc.programFileVisibility === "organizers" ? "organizers" : "everyone",
    venueType: doc.venueType || "",
    announcements: doc.announcements || "",
    allowedCourses: asStringList(doc.allowedCourses),
    requiredFiles: asStringList(doc.requiredFiles),
    speakers: asStringList(doc.speakers),
    collaboratingDepartments: asStringList(doc.collaboratingDepartments),
    audienceSchools: asStringList(doc.audienceSchools),
    programActivities: asStringList(doc.programActivities),
    department: doc.department || "",
    hasPoster,
    hasConceptPaper,
    hasCertificateTemplate,
    hasProgramFile,
    posterImage: options?.includeMedia ? doc.posterImageBase64 || "" : "",
    attachments: {
      conceptPaper: hasConceptPaper
        ? `/api/events/${id}/attachments/concept-paper`
        : "",
      certificateTemplate: hasCertificateTemplate
        ? `/api/events/${id}/attachments/certificate-template`
        : "",
      programFile: hasProgramFile
        ? `/api/events/${id}/attachments/program-file`
        : "",
      poster: hasPoster ? `/api/events/${id}/attachments/poster` : "",
    },
    status: doc.status,
    organizerId: doc.organizerId || "",
    organizerEmail: doc.organizerEmail || "",
    organizerName: doc.organizerName || "",
    submittedByPortal: doc.submittedByPortal || "user",
    reviewedByEmail: doc.reviewedByEmail || "",
    reviewNote: doc.reviewNote || "",
    reservationId: doc.reservationId || "",
    reservationStatus: doc.reservationStatus || "",
    reservationRoomId: doc.reservationRoomId || "",
    reservationRoomName: doc.reservationRoomName || "",
    reservationCapacity:
      typeof doc.reservationCapacity === "number" ? doc.reservationCapacity : null,
    advisorEmail: doc.advisorEmail || "",
    reservationSyncError: doc.reservationSyncError || "",
    reservationSyncedAt: doc.reservationSyncedAt || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
