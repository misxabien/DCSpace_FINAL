import {
  mapSanitizedToOrganized,
  mapSanitizedToOrganizedDetail,
  type OrganizedDetailEvent,
  type OrganizedListEvent,
} from "@/lib/events/organized-map";
import type { SanitizedEvent } from "@/lib/events/map-event";
import type { OrganizedEvent } from "@/components/organized/OrganizedShell";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { EventRegistration, ParticipantDetail } from "@/lib/organizedRegistrations";

type LiveEvent = SanitizedEvent & { submissions?: number };

export async function fetchOrganizedEventsLive(): Promise<OrganizedEvent[]> {
  const res = await fetch("/api/organized/events", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load organized events.");
  const data = (await res.json()) as { events?: LiveEvent[] };
  return (data.events || []).map((event) =>
    mapSanitizedToOrganized(event, Number(event.submissions || 0)),
  ) as OrganizedEvent[];
}

export async function fetchOrganizedEventLive(
  id: string,
): Promise<OrganizedEventDetail | null> {
  const [eventRes, registrationsRes] = await Promise.all([
    fetch(`/api/events/${encodeURIComponent(id)}`, { cache: "no-store" }),
    fetch(`/api/organized/events/${encodeURIComponent(id)}/registrations`, {
      cache: "no-store",
    }),
  ]);
  if (!eventRes.ok) return null;
  const payload = (await eventRes.json()) as { event?: SanitizedEvent };
  if (!payload.event) return null;
  const registrations = registrationsRes.ok
    ? ((await registrationsRes.json()) as { registrations?: unknown[] }).registrations || []
    : [];
  return mapSanitizedToOrganizedDetail(
    payload.event,
    registrations.length,
  ) as OrganizedEventDetail;
}

export type LiveRegistration = EventRegistration & {
  email?: string;
  school?: string;
  organization?: string;
  organizationRole?: string;
  attendanceMinutes?: number;
  qualifiedForCertificate?: boolean;
  files?: Array<{
    id: string;
    name: string;
    fileName?: string;
    status?: string;
    uploaded?: boolean;
    hasFile?: boolean;
  }>;
};

export async function fetchEventRegistrationsLive(eventId: string): Promise<LiveRegistration[]> {
  const res = await fetch(
    `/api/organized/events/${encodeURIComponent(eventId)}/registrations`,
    { cache: "no-store" },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { registrations?: LiveRegistration[] };
  return data.registrations || [];
}

export function mapLiveParticipant(
  row: LiveRegistration,
  requiredFileName = "Required File",
): ParticipantDetail {
  const files = row.files?.length
    ? row.files.map((file) => ({
        id: file.id,
        name: file.fileName || file.name || requiredFileName,
        viewed: Boolean(file.hasFile || file.uploaded),
        status: (file.status as ParticipantDetail["files"][number]["status"]) || "pending",
      }))
    : [
        {
          id: "file-1",
          name: requiredFileName,
          viewed: false,
          status: "pending" as const,
        },
      ];

  return {
    id: row.id,
    studentNumber: row.studentNumber || "—",
    studentName: row.studentName,
    course: row.course || "—",
    courseSchool: row.school || row.course || "—",
    organization: row.organization || "None",
    organizationRole: row.organizationRole || "Member",
    files,
    gracePeriodStatus: (row.attendanceMinutes || 0) > 0 ? "On Time" : "Pending",
    attendanceRequirementStatus: row.qualifiedForCertificate
      ? "Met Requirement"
      : "Incomplete",
  };
}

export type { OrganizedDetailEvent, OrganizedListEvent };
