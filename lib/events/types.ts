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

export function sanitizeEvent(
  doc: SpaceEvent & { _id: ObjectId },
  options?: { includeMedia?: boolean },
) {
  return {
    id: doc._id.toString(),
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
    hasPoster: Boolean(doc.posterImageBase64),
    hasConceptPaper: Boolean(doc.conceptPaperBase64),
    hasCertificateTemplate: Boolean(doc.certificateTemplateBase64),
    hasProgramFile: Boolean(doc.programFileBase64),
    posterImage: options?.includeMedia ? doc.posterImageBase64 || "" : "",
    attachments: {
      conceptPaper: doc.conceptPaperBase64
        ? `/api/events/${doc._id.toString()}/attachments/concept-paper`
        : "",
      certificateTemplate: doc.certificateTemplateBase64
        ? `/api/events/${doc._id.toString()}/attachments/certificate-template`
        : "",
      programFile: doc.programFileBase64
        ? `/api/events/${doc._id.toString()}/attachments/program-file`
        : "",
      poster: doc.posterImageBase64
        ? `/api/events/${doc._id.toString()}/attachments/poster`
        : "",
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
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
