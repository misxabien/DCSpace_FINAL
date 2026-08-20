import type { OrganizedEvent } from "@/components/organized/OrganizedShell";
import { loadOrganizedEvents } from "@/components/organized/OrganizedShell";

export type OrganizedEventDetail = OrganizedEvent & {
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
};

function defaultDetailFields(): Omit<OrganizedEventDetail, keyof OrganizedEvent> {
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
  return { ...event, ...defaultDetailFields() };
}

export function getOrganizedEventById(id: string): OrganizedEventDetail | null {
  const events = loadOrganizedEvents();
  const event = events.find((item) => item.id === id);
  if (!event) return null;
  return enrichOrganizedEvent(event);
}
