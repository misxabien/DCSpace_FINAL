/** Map Mongo event documents into legacy DCEvents card/detail shape. */

export type SanitizedEvent = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  attendanceRequired?: string;
  gracePeriod?: string;
  venueType?: string;
  announcements?: string;
  allowedCourses?: string[];
  requiredFiles?: string[];
  speakers?: string[];
  collaboratingDepartments?: string[];
  audienceSchools?: string[];
  programActivities?: string[];
  department?: string;
  status?: string;
  organizerName?: string;
  organizerEmail?: string;
  posterImage?: string;
  hasPoster?: boolean;
  reviewNote?: string;
  conceptPaperName?: string;
  certificateTemplateName?: string;
  programFileName?: string;
  programFileVisibility?: "everyone" | "organizers";
  hasConceptPaper?: boolean;
  hasCertificateTemplate?: boolean;
  hasProgramFile?: boolean;
  attachments?: {
    conceptPaper?: string;
    certificateTemplate?: string;
    programFile?: string;
    poster?: string;
  };
};

export type LegacyCardEvent = {
  id: string;
  name: string;
  venue: string;
  time: string;
  date: string;
  category: string;
  status: string;
  venueType: string;
  eventType: string;
  organization: string;
  course: string;
  department: string;
  attendanceRequired: string;
  gracePeriod: string;
  requiresFiles: boolean;
  requiredFiles: string[];
  filesApproved: boolean;
  description: string;
  announcements: string;
  tags?: string[];
  imageUrl?: string;
  speakers: string[];
  programActivities: string[];
  collaboratingDepartments: string[];
  audienceSchools: string[];
  organizerEmail: string;
  reviewNote: string;
  dbStatus: string;
  attachmentFiles: Array<{ label: string; fileName: string; url: string }>;
};

function formatTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatEventTimeRange(startsAt?: string, endsAt?: string): string {
  const startLabel = startsAt ? formatTimeLabel(startsAt) : "";
  const endLabel = endsAt ? formatTimeLabel(endsAt) : "";
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  if (startLabel) return startLabel;
  return "TBA";
}

export function eventDateFromStartsAt(startsAt?: string): string {
  const start = parseEventStart(startsAt);
  if (start) {
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/** Parse event start into a local Date (supports ISO and YYYY-MM-DD). */
export function parseEventStart(startsAt?: string): Date | null {
  const raw = String(startsAt || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const day = new Date(`${raw}T12:00:00`);
    return Number.isNaN(day.getTime()) ? null : day;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Calendar bucket for approved/live/completed events. */
export function eventTimingBucket(
  startsAt?: string,
  status?: string,
): "today" | "upcoming" | "past" {
  if (status === "completed") return "past";
  if (status === "live") {
    const start = parseEventStart(startsAt);
    if (!start) return "today";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(start);
    day.setHours(0, 0, 0, 0);
    if (day.getTime() < today.getTime()) return "past";
    if (day.getTime() > today.getTime()) return "upcoming";
    return "today";
  }

  const start = parseEventStart(startsAt);
  if (!start) return "upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return "today";
  if (day.getTime() > today.getTime()) return "upcoming";
  return "past";
}

export function timingToJoinedCategory(
  timing: "today" | "upcoming" | "past",
): "joined-today" | "joined-upcoming" | "joined-past" {
  if (timing === "today") return "joined-today";
  if (timing === "upcoming") return "joined-upcoming";
  return "joined-past";
}

/** Explore theme category from organizer-chosen type (not date). */
export function thematicCategory(e: SanitizedEvent): string {
  const cat = (e.category || "").toLowerCase();
  if (cat.includes("tech")) return "tech";
  if (
    cat.includes("org") ||
    cat.includes("social") ||
    cat.includes("party") ||
    cat.includes("celebration")
  ) {
    return "organization";
  }
  if (cat.includes("acad")) return "academic";
  return "";
}

export function bucketCategory(e: SanitizedEvent): string {
  const theme = thematicCategory(e);
  const timing = eventTimingBucket(e.startsAt, e.status);

  if (timing === "today") return theme || "today";
  if (timing === "past") return theme || "past";
  return theme || "upcoming";
}

function mapCardStatus(status?: string): string {
  switch (status) {
    case "approved":
    case "live":
      return "open";
    case "completed":
      return "passed";
    case "cancelled":
      return "cancelled";
    case "postponed":
      return "postponed";
    case "rejected":
      return "rejected";
    case "pending":
      return "pending";
    default:
      return "open";
  }
}

export function resolveEventImageUrl(e: SanitizedEvent): string {
  if (e.posterImage) return e.posterImage;
  if (e.attachments?.poster) return e.attachments.poster;
  return "";
}

function buildAttachmentFiles(
  e: SanitizedEvent,
  options?: { includeOrganizerOnly?: boolean },
) {
  const files: LegacyCardEvent["attachmentFiles"] = [];
  if (e.hasConceptPaper && e.attachments?.conceptPaper) {
    files.push({
      label: "Concept Paper",
      fileName: e.conceptPaperName || "concept-paper.pdf",
      url: e.attachments.conceptPaper,
    });
  }
  if (e.hasCertificateTemplate && e.attachments?.certificateTemplate) {
    files.push({
      label: "Certificate Template",
      fileName: e.certificateTemplateName || "certificate-template.pdf",
      url: e.attachments.certificateTemplate,
    });
  }
  const programOrganizerOnly = e.programFileVisibility === "organizers";
  if (
    e.hasProgramFile &&
    e.attachments?.programFile &&
    (options?.includeOrganizerOnly || !programOrganizerOnly)
  ) {
    files.push({
      label: "Program Flow",
      fileName: e.programFileName || "program-flow.pdf",
      url: e.attachments.programFile,
    });
  }
  return files;
}

export function mapDbEventToCard(
  e: SanitizedEvent,
  category = bucketCategory(e),
): LegacyCardEvent {
  const courses = Array.isArray(e.allowedCourses) ? e.allowedCourses : [];
  const requiredFiles = Array.isArray(e.requiredFiles) ? e.requiredFiles : [];

  return {
    id: e.id,
    name: e.title,
    venue: e.location || "Venue TBA",
    time: formatEventTimeRange(e.startsAt, e.endsAt),
    date: eventDateFromStartsAt(e.startsAt),
    category,
    status: mapCardStatus(e.status),
    venueType: e.venueType || "On Campus",
    eventType: e.category || "Event",
    organization: e.organizerName || "—",
    course: courses.length ? courses.join(", ") : "—",
    department: e.department || "—",
    attendanceRequired: e.attendanceRequired || "30 minutes",
    gracePeriod: e.gracePeriod || "15 minutes",
    requiresFiles: requiredFiles.length > 0,
    requiredFiles,
    filesApproved: false,
    description: e.description || "",
    announcements: e.announcements || "",
    imageUrl: resolveEventImageUrl(e),
    speakers: Array.isArray(e.speakers) ? e.speakers : [],
    programActivities: Array.isArray(e.programActivities) ? e.programActivities : [],
    collaboratingDepartments: Array.isArray(e.collaboratingDepartments)
      ? e.collaboratingDepartments
      : [],
    audienceSchools: Array.isArray(e.audienceSchools) ? e.audienceSchools : [],
    organizerEmail: String(e.organizerEmail || ""),
    reviewNote: e.reviewNote || "",
    dbStatus: e.status || "",
    attachmentFiles: buildAttachmentFiles(e),
  };
}
