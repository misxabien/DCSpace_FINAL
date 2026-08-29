import {
  eventDateFromStartsAt,
  formatEventTimeRange,
  type SanitizedEvent,
} from "@/lib/events/map-event";

export type OrganizedListEvent = {
  id: string;
  title: string;
  date: string;
  venue: string;
  time: string;
  status: "postponed" | "cancelled" | "closed" | "open";
  submissions: number;
  reviewNote?: string;
  reviewStatus?: string;
  imageUrl?: string;
};

export type OrganizedDetailEvent = OrganizedListEvent & {
  imageUrl: string;
  announcements: string[];
  description: string[];
  venueType: string;
  eventType: string;
  organization: string;
  course: string;
  department: string;
  attendanceRequired: string;
  gracePeriod: string;
  requiredFiles: string;
  speakers: string[];
  programActivities: string[];
  collaboratingDepartments: string[];
  audienceSchools: string[];
  attachments: Array<{ label: string; fileName: string; url: string }>;
};

function splitParagraphs(value?: string) {
  return String(value || "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mapOrganizedStatus(status?: string): OrganizedListEvent["status"] {
  if (status === "postponed") return "postponed";
  if (status === "cancelled") return "cancelled";
  if (status === "closed" || status === "rejected" || status === "completed") return "closed";
  if (status === "draft" || status === "pending") return "open";
  return "open";
}

export function mapSanitizedToOrganized(
  event: SanitizedEvent,
  submissions = 0,
): OrganizedListEvent {
  return {
    id: event.id,
    title: event.title,
    date: eventDateFromStartsAt(event.startsAt),
    venue: event.location || "Event Venue",
    time: formatEventTimeRange(event.startsAt, event.endsAt),
    status: mapOrganizedStatus(event.status),
    submissions,
    reviewStatus: event.status,
    reviewNote:
      event.status === "pending"
        ? "Pending for approval"
        : event.status === "rejected"
          ? "Rejected"
          : "",
    imageUrl:
      event.posterImage ||
      event.attachments?.poster ||
      (event.hasPoster ? `/api/events/${encodeURIComponent(event.id)}/attachments/poster` : ""),
  };
}

export function mapSanitizedToOrganizedDetail(
  event: SanitizedEvent,
  submissions = 0,
): OrganizedDetailEvent {
  const requiredFiles = Array.isArray(event.requiredFiles) ? event.requiredFiles : [];
  const courses = Array.isArray(event.allowedCourses) ? event.allowedCourses : [];
  const attachments: OrganizedDetailEvent["attachments"] = [];
  if (event.hasConceptPaper && event.attachments?.conceptPaper) {
    attachments.push({
      label: "Approved Concept Paper",
      fileName: event.conceptPaperName || "concept-paper.pdf",
      url: event.attachments.conceptPaper,
    });
  }
  if (event.hasCertificateTemplate && event.attachments?.certificateTemplate) {
    attachments.push({
      label: "E-Certificate Template",
      fileName: event.certificateTemplateName || "e-certificate.pdf",
      url: event.attachments.certificateTemplate,
    });
  }
  if (event.hasProgramFile && event.attachments?.programFile) {
    attachments.push({
      label: "Program Flow",
      fileName: event.programFileName || "program-flow.pdf",
      url: event.attachments.programFile,
    });
  }
  return {
    ...mapSanitizedToOrganized(event, submissions),
    imageUrl:
      event.posterImage ||
      event.attachments?.poster ||
      (event.hasPoster
        ? `/api/events/${encodeURIComponent(event.id)}/attachments/poster`
        : ""),
    announcements: splitParagraphs(event.announcements).length
      ? splitParagraphs(event.announcements)
      : ["No announcements yet."],
    description: splitParagraphs(event.description).length
      ? splitParagraphs(event.description)
      : ["No description provided."],
    venueType: event.venueType || "On Campus",
    eventType: event.category || "Event",
    organization: event.organizerName || "—",
    course: courses.length ? courses.join(", ") : "—",
    department: event.department || "—",
    attendanceRequired: event.attendanceRequired || "30 minutes",
    gracePeriod: event.gracePeriod || "15 minutes",
    requiredFiles: requiredFiles.length ? requiredFiles.join(", ") : "None",
    speakers: Array.isArray(event.speakers) ? event.speakers : [],
    programActivities: Array.isArray(event.programActivities) ? event.programActivities : [],
    collaboratingDepartments: Array.isArray(event.collaboratingDepartments)
      ? event.collaboratingDepartments
      : [],
    audienceSchools: Array.isArray(event.audienceSchools) ? event.audienceSchools : [],
    attachments,
  };
}
