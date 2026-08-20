export type EventRegistration = {
  id: string;
  studentNumber: string;
  studentName: string;
  course: string;
};

export type FileSubmissionStatus = "pending" | "accepted" | "rejected";

export type ParticipantFile = {
  id: string;
  name: string;
  viewed: boolean;
  status: FileSubmissionStatus;
};

export type ParticipantDetail = EventRegistration & {
  courseSchool: string;
  organization: string;
  organizationRole: string;
  files: ParticipantFile[];
  gracePeriodStatus: string;
  attendanceRequirementStatus: string;
};

const STORAGE_KEY = "dc_organized_registrations_v1";
const FILE_STATUS_KEY = "dc_participant_file_status_v1";

function loadAll(): Record<string, EventRegistration[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, EventRegistration[]>;
  } catch {
    return {};
  }
}

function loadFileStatuses(): Record<string, FileSubmissionStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FILE_STATUS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, FileSubmissionStatus>;
  } catch {
    return {};
  }
}

export function saveFileStatus(participantId: string, fileId: string, status: FileSubmissionStatus) {
  const key = `${participantId}:${fileId}`;
  const all = loadFileStatuses();
  all[key] = status;
  localStorage.setItem(FILE_STATUS_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("dc-participant-changed"));
}

export function getEventRegistrations(eventId: string): EventRegistration[] {
  return loadAll()[eventId] || [];
}

export function getParticipantDetail(
  eventId: string,
  registrationId: string,
  requiredFileName = "Required File",
): ParticipantDetail | null {
  const registration = getEventRegistrations(eventId).find((row) => row.id === registrationId);
  if (!registration) return null;

  const fileId = "file-1";
  const storedStatus = loadFileStatuses()[`${registrationId}:${fileId}`];

  return {
    ...registration,
    courseSchool: registration.course || "—",
    organization: "—",
    organizationRole: "—",
    gracePeriodStatus: "Pending",
    attendanceRequirementStatus: "Incomplete",
    files: [
      {
        id: fileId,
        name: requiredFileName,
        viewed: false,
        status: storedStatus || "pending",
      },
    ],
  };
}
