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
  /** True when a poster blob exists (survives list projections that omit base64). */
  hasPoster?: boolean;
  /** Organizer lets registered participants upload event photos. */
  allowParticipantPhotos?: boolean;
  /** Admin asked the organizer to revise a pending submission. */
  revisionRequested?: boolean;
  status: EventStatus;
  organizerId?: string;
  organizerEmail?: string;
  organizerName?: string;
  submittedByPortal?: "user" | "admin";
  reviewedByEmail?: string;
  reviewNote?: string;
  /** iRoom / eRoomReserve reservation (organizer create-event flow). */
  iroomReservationId?: string;
  iroomStatus?: IroomReservationStatus;
  iroomRoomId?: string;
  iroomRoomName?: string;
  iroomRejectionReason?: string;
  iroomSyncedAt?: string;
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

/** Exclude attachment blobs for list/card views — keeps Mongo reads fast. */
export const EVENT_LIST_PROJECTION = {
  posterImageBase64: 0,
  conceptPaperBase64: 0,
  programFileBase64: 0,
  certificateTemplateBase64: 0,
} as const;

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

function deriveEndsAt(
  doc: {
    endsAt?: string;
    date?: string;
    endTime?: string;
  },
  startsAt: string,
): string {
  if (doc.endsAt) return String(doc.endsAt);
  const day =
    String(doc.date || "").trim() ||
    (startsAt.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] ||
    "";
  if (!day || !doc.endTime) return "";
  return `${day}T${normalizeClock(String(doc.endTime))}`;
}

function formatPosterDataUrl(base64?: string, mimeType?: string) {
  const raw = String(base64 || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  return `data:${mimeType || "image/jpeg"};base64,${raw}`;
}

/**
 * Venue to show for an event. A published on-campus event whose room eRoomReserve
 * has not approved yet shows "TBA" (it can be posted before the room is confirmed);
 * once the room is approved, the real venue appears.
 */
export function eventDisplayLocation(doc: {
  location?: string | null;
  venue?: string | null;
  venueType?: string | null;
  status?: string | null;
  reservationStatus?: string | null;
  iroomStatus?: string | null;
  reservationRoomName?: string | null;
}): string {
  const location = String(doc.location || doc.venue || "").trim();
  const onCampus = String(doc.venueType || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .includes("on campus");
  if (!onCampus) return location;
  const roomStatus = [doc.reservationStatus, doc.iroomStatus].map((s) => String(s || "").toLowerCase());
  const roomApproved = roomStatus.some((s) => s === "approved" || s === "completed");
  if (roomApproved) return location && location !== "TBA" ? location : String(doc.reservationRoomName || "TBA");
  // Upcoming/ongoing events wait for the room; a finished event keeps its venue.
  const published = ["approved", "live", "ongoing"].includes(String(doc.status || "").toLowerCase());
  return published ? "TBA" : location;
}

/** Slim card payload for admin/organizer event lists (fast JSON). */
export function sanitizeEventListCard(doc: SpaceEvent & { _id: ObjectId }) {
  const id = doc._id?.toString?.() || String(doc._id || "");
  const hasCertificateTemplate =
    Boolean(doc.certificateTemplateName) || Boolean(doc.certificateTemplateBase64);
  return {
    id,
    title: String(doc.title || "Untitled event"),
    status: String(doc.status || ""),
    location: eventDisplayLocation(doc),
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
    certificateTemplateName: String(doc.certificateTemplateName || ""),
    hasCertificateTemplate,
    createdAt: String(doc.createdAt || ""),
    updatedAt: String(doc.updatedAt || ""),
  };
}

export function sanitizeEvent(
  doc: SpaceEvent & { _id: ObjectId } & {
    date?: string;
    startTime?: string;
    endTime?: string;
    venue?: string;
  },
  options?: { includeMedia?: boolean; includePoster?: boolean },
) {
  const id = doc._id.toString();
  const startsAt = String(doc.startsAt || "").trim() || deriveStartsAt(doc);
  const endsAt = String(doc.endsAt || "").trim() || deriveEndsAt(doc, startsAt);

  return {
    id,
    title: doc.title,
    description: doc.description || "",
    category: doc.category || "",
    location: eventDisplayLocation(doc),
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
    hasPoster: Boolean(
      doc.hasPoster || doc.posterImageBase64 || doc.posterImageMimeType,
    ),
    hasConceptPaper: Boolean(doc.conceptPaperBase64 || doc.conceptPaperName),
    hasCertificateTemplate: Boolean(
      doc.certificateTemplateBase64 || doc.certificateTemplateName,
    ),
    hasProgramFile: Boolean(doc.programFileBase64 || doc.programFileName),
    posterImage:
      options?.includeMedia || options?.includePoster
        ? formatPosterDataUrl(doc.posterImageBase64, doc.posterImageMimeType)
        : "",
    attachments: {
      conceptPaper:
        doc.conceptPaperBase64 || doc.conceptPaperName
          ? `/api/events/${doc._id.toString()}/attachments/concept-paper`
          : "",
      certificateTemplate:
        doc.certificateTemplateBase64 || doc.certificateTemplateName
          ? `/api/events/${doc._id.toString()}/attachments/certificate-template`
          : "",
      programFile:
        doc.programFileBase64 || doc.programFileName
          ? `/api/events/${doc._id.toString()}/attachments/program-file`
          : "",
      poster:
        doc.hasPoster || doc.posterImageBase64 || doc.posterImageMimeType
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
    revisionRequested: doc.revisionRequested === true,
    allowParticipantPhotos: doc.allowParticipantPhotos === true,
    iroomReservationId: doc.iroomReservationId || "",
    iroomStatus: doc.iroomStatus || "none",
    iroomRoomId: doc.iroomRoomId || "",
    iroomRoomName: doc.iroomRoomName || "",
    iroomRejectionReason: doc.iroomRejectionReason || "",
    iroomSyncedAt: doc.iroomSyncedAt || "",
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
