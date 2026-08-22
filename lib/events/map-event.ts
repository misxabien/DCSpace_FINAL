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
  posterImage?: string;
  reviewNote?: string;
  conceptPaperName?: string;
  certificateTemplateName?: string;
  programFileName?: string;
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
  const start = startsAt ? new Date(startsAt) : null;
  if (start && !Number.isNaN(start.getTime())) {
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export function bucketCategory(e: SanitizedEvent): string {
  const status = e.status || "";
  if (status === "live") return "today";
  if (status === "completed") return "joined-past";

  const start = e.startsAt ? new Date(e.startsAt) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(start);
    day.setHours(0, 0, 0, 0);
    if (day.getTime() === today.getTime()) return "today";
    if (day.getTime() > today.getTime()) return "academic";
    return "joined-past";
  }

  const cat = (e.category || "").toLowerCase();
  if (cat.includes("tech")) return "tech";
  if (cat.includes("org")) return "organization";
  if (cat.includes("acad")) return "academic";
  return "academic";
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
  };
}
