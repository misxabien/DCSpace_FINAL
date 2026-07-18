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
};

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=480&fit=crop&q=80";

const LOREM_A = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.",
];

const LOREM_B = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",
  "Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.",
];

const DETAIL_ENRICHMENT: Record<string, Omit<OrganizedEventDetail, keyof OrganizedEvent>> = {
  "17": {
    imageUrl: DEFAULT_IMAGE,
    announcements: LOREM_A,
    description: LOREM_B,
    venueType: "Off Campus",
    eventType: "Party",
    organization: "Alumni Association",
    course: "General",
    department: "Alumni Office",
    attendanceRequired: "1 hour",
    gracePeriod: "20 minutes",
    requiredFiles: "Parent's Consent Form",
  },
  "9": {
    imageUrl: DEFAULT_IMAGE,
    announcements: LOREM_A,
    description: LOREM_B,
    venueType: "On Campus",
    eventType: "Seminar",
    organization: "Tech Guild",
    course: "BSIT",
    department: "College of IT",
    attendanceRequired: "2 hours",
    gracePeriod: "15 minutes",
    requiredFiles: "Parent's Consent Form",
  },
  "12": {
    imageUrl: DEFAULT_IMAGE,
    announcements: LOREM_A,
    description: LOREM_B,
    venueType: "On Campus",
    eventType: "Seminar",
    organization: "Entrepreneurship Hub",
    course: "General",
    department: "Business School",
    attendanceRequired: "1 hour",
    gracePeriod: "15 minutes",
    requiredFiles: "None",
  },
  "15": {
    imageUrl: DEFAULT_IMAGE,
    announcements: LOREM_A,
    description: LOREM_B,
    venueType: "On Campus",
    eventType: "Outreach",
    organization: "Your Organization",
    course: "General",
    department: "Student Affairs",
    attendanceRequired: "1 hour",
    gracePeriod: "15 minutes",
    requiredFiles: "None",
  },
  "2": {
    imageUrl: DEFAULT_IMAGE,
    announcements: LOREM_A,
    description: LOREM_B,
    venueType: "On Campus",
    eventType: "Workshop",
    organization: "Leadership Org",
    course: "BSIT",
    department: "College of IT",
    attendanceRequired: "45 minutes",
    gracePeriod: "10 minutes",
    requiredFiles: "Parent's Consent Form",
  },
  "8": {
    imageUrl: DEFAULT_IMAGE,
    announcements: LOREM_A,
    description: LOREM_B,
    venueType: "On Campus",
    eventType: "Competition",
    organization: "Math Club",
    course: "General",
    department: "College of Science",
    attendanceRequired: "1 hour",
    gracePeriod: "5 minutes",
    requiredFiles: "None",
  },
};

function defaultDetailFields(): Omit<OrganizedEventDetail, keyof OrganizedEvent> {
  return {
    imageUrl: DEFAULT_IMAGE,
    announcements: LOREM_A,
    description: LOREM_B,
    venueType: "On Campus",
    eventType: "Seminar",
    organization: "Organization Name",
    course: "Course",
    department: "School/Department",
    attendanceRequired: "30 minutes",
    gracePeriod: "15 minutes",
    requiredFiles: "Required File(s)",
  };
}

export function enrichOrganizedEvent(event: OrganizedEvent): OrganizedEventDetail {
  const extra = DETAIL_ENRICHMENT[event.id] ?? defaultDetailFields();
  return { ...event, ...extra };
}

export function getOrganizedEventById(id: string): OrganizedEventDetail | null {
  const events = loadOrganizedEvents();
  const event = events.find((item) => item.id === id);
  if (!event) return null;
  return enrichOrganizedEvent(event);
}
