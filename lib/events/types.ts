import type { ObjectId } from "mongodb";

export type EventStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "postponed"
  | "live"
  | "completed"
  | "cancelled";

export type IroomReservationStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
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
  iroomReservationId?: string;
  iroomStatus?: IroomReservationStatus;
  iroomRoomId?: string;
  iroomRoomName?: string;
  iroomRejectionReason?: string;
  iroomSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export { eventsCollection } from "@/lib/db/admin-collections";

function normalizeClock(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "00:00";
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "00:00";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

/** Legacy admin docs used `date` + `startTime` instead of `startsAt`. */
function deriveStartsAt(doc: {
  startsAt?: string;
  date?: string;
  startTime?: string;
}): string {
  if (doc.startsAt) return String(doc.startsAt);
  const day = String(doc.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return `${day}T${normalizeClock(String(doc.startTime || "00:00"))}`;
}

function deriveEndsAt(doc: {
  endsAt?: string;
  date?: string;
  endTime?: string;
}, startsAt: string): string {
  if (doc.endsAt) return String(doc.endsAt);
  const day =
    String(doc.date || "").trim() ||
    (startsAt.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] ||
    "";
  if (!day || !doc.endTime) return "";
  return `${day}T${normalizeClock(String(doc.endTime))}`;
}

export function sanitizeEvent(
  doc: SpaceEvent & { _id: ObjectId } & {
    date?: string;
    startTime?: string;
    endTime?: string;
    venue?: string;
  },
  options?: { includeMedia?: boolean },
) {
  const startsAt = String(doc.startsAt || "").trim() || deriveStartsAt(doc);
  const endsAt = String(doc.endsAt || "").trim() || deriveEndsAt(doc, startsAt);

  return {
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description || "",
    category: doc.category || "",
    location: doc.location || doc.venue || "",
    startsAt,
    endsAt,
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
    iroomReservationId: doc.iroomReservationId || "",
    iroomStatus: doc.iroomStatus || "none",
    iroomRoomId: doc.iroomRoomId || "",
    iroomRoomName: doc.iroomRoomName || "",
    iroomRejectionReason: doc.iroomRejectionReason || "",
    iroomSyncedAt: doc.iroomSyncedAt || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
