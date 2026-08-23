import type { OrganizedEvent } from "@/components/organized/OrganizedShell";

export type OrganizedEventDetail = Omit<OrganizedEvent, "imageUrl"> & {
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
  attachments?: Array<{ label: string; fileName: string; url: string }>;
  iroomReservationId?: string;
  iroomStatus?: string;
  iroomRoomName?: string;
  iroomRejectionReason?: string;
};

function defaultDetailFields(): Omit<OrganizedEventDetail, keyof OrganizedEvent> & {
  imageUrl: string;
} {
  return {
    imageUrl: "",
    announcements: ["No announcements yet."],
    description: ["No description provided."],
    venueType: "—",
    eventType: "Event",
    organization: "—",
    course: "—",
    department: "—",
    attendanceRequired: "—",
    gracePeriod: "—",
    requiredFiles: "None",
    attachments: [],
  };
}

export function enrichOrganizedEvent(event: OrganizedEvent): OrganizedEventDetail {
  return { ...event, ...defaultDetailFields(), imageUrl: event.imageUrl || "" };
}

/** Local enrichment removed — use fetchOrganizedEventLive. */
export function getOrganizedEventById(_id: string): OrganizedEventDetail | null {
  return null;
}
