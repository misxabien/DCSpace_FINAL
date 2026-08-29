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
import type { InviteAudience, InviteCandidate } from "@/lib/organizedInvitations";
import { authFetch } from "@/lib/user-api";

type LiveEvent = SanitizedEvent & { submissions?: number };

export async function fetchOrganizedEventsLive(
  signal?: AbortSignal,
): Promise<OrganizedEvent[]> {
  const res = await authFetch("/api/organized/events", { cache: "no-store", signal });
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
    authFetch(`/api/events/${encodeURIComponent(id)}`, { cache: "no-store" }),
    authFetch(`/api/organized/events/${encodeURIComponent(id)}/registrations`, {
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
  const res = await authFetch(
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
    : [];

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

export async function fetchInviteCandidatesLive(
  audience: InviteAudience,
): Promise<InviteCandidate[]> {
  const role = audience === "faculty" ? "faculty" : "student";
  const res = await authFetch(`/api/organized/users?role=${encodeURIComponent(role)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load invite candidates.");
  const data = (await res.json()) as {
    users?: Array<{
      id: string;
      email: string;
      name: string;
      studentNumber: string;
      course: string;
      organization: string;
    }>;
  };
  return (data.users || []).map((user) => ({
    id: user.id,
    email: user.email,
    audience,
    number: user.studentNumber || "—",
    name: user.name || user.email,
    course: user.course || "—",
    organization: user.organization || "—",
  }));
}

export async function fetchEventInvitationsLive(eventId: string) {
  const res = await authFetch(
    `/api/organized/events/${encodeURIComponent(eventId)}/invitations`,
    { cache: "no-store" },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    invitations?: Array<{ email: string; userId?: string; status?: string }>;
  };
  return data.invitations || [];
}

export async function toggleEventInvitationLive(
  eventId: string,
  candidate: InviteCandidate,
  invited: boolean,
) {
  const res = await authFetch(
    `/api/organized/events/${encodeURIComponent(eventId)}/invitations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: candidate.email,
        userId: candidate.id,
        userName: candidate.name,
        studentNumber: candidate.number,
        course: candidate.course,
        organization: candidate.organization,
        audience: candidate.audience,
        invited,
      }),
    },
  );
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      (payload as { error?: string }).error || "Failed to update invitation.",
    );
  }
}

export function mapLiveRegistration(row: LiveRegistration): EventRegistration {
  return {
    id: row.id,
    studentNumber: row.studentNumber || "—",
    studentName: row.studentName,
    course: row.course || "—",
  };
}

export async function fetchParticipantDetailLive(
  eventId: string,
  registrationId: string,
  requiredFileName = "Required File",
): Promise<ParticipantDetail | null> {
  const rows = await fetchEventRegistrationsLive(eventId);
  const row = rows.find((item) => item.id === registrationId);
  if (!row) return null;
  return mapLiveParticipant(row, requiredFileName);
}

export type { OrganizedDetailEvent, OrganizedListEvent };
