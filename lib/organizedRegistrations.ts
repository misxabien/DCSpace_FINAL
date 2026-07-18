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

const DEFAULT_REGISTRATIONS: EventRegistration[] = [
  {
    id: "reg-1",
    studentNumber: "20XX-XXXXX",
    studentName: "Khrystelle Jan Esplana",
    course: "BSIT",
  },
  {
    id: "reg-2",
    studentNumber: "20XX-XXXXX",
    studentName: "Misxa Bien Germino",
    course: "BSIT",
  },
  {
    id: "reg-3",
    studentNumber: "20XX-XXXXX",
    studentName: "Amira Rachel Marqueses",
    course: "BSIT",
  },
  {
    id: "reg-4",
    studentNumber: "20XX-XXXXX",
    studentName: "Gwyneth Ashley Mucio",
    course: "BSIT",
  },
];

const PARTICIPANT_ENRICHMENT: Record<
  string,
  Omit<ParticipantDetail, keyof EventRegistration | "files"> & { fileStatus?: FileSubmissionStatus }
> = {
  "reg-1": {
    courseSchool: "BSIT SCMCS",
    organization: "DominiXode",
    organizationRole: "Organization Member",
    gracePeriodStatus: "On Time",
    attendanceRequirementStatus: "Met Requirement",
    fileStatus: "pending",
  },
  "reg-2": {
    courseSchool: "BSIT SCMCS",
    organization: "DominiXode",
    organizationRole: "Organization Member",
    gracePeriodStatus: "On Time",
    attendanceRequirementStatus: "Met Requirement",
    fileStatus: "accepted",
  },
  "reg-3": {
    courseSchool: "BSIT SCMCS",
    organization: "Tech Guild",
    organizationRole: "Organization Member",
    gracePeriodStatus: "Late",
    attendanceRequirementStatus: "Met Requirement",
    fileStatus: "rejected",
  },
  "reg-4": {
    courseSchool: "BSIT SCMCS",
    organization: "DominiXode",
    organizationRole: "Organization Member",
    gracePeriodStatus: "On Time",
    attendanceRequirementStatus: "Incomplete",
    fileStatus: "pending",
  },
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
  const stored = loadAll()[eventId];
  if (stored?.length) return stored;
  return DEFAULT_REGISTRATIONS.map((row) => ({ ...row, id: `${eventId}-${row.id}` }));
}

function baseRegistrationId(registrationId: string) {
  const parts = registrationId.split("-");
  if (parts.length >= 2) {
    return parts.slice(-2).join("-");
  }
  return registrationId;
}

export function getParticipantDetail(
  eventId: string,
  registrationId: string,
  requiredFileName = "Parent's Consent Form"
): ParticipantDetail | null {
  const registration = getEventRegistrations(eventId).find((row) => row.id === registrationId);
  if (!registration) return null;

  const baseId = baseRegistrationId(registrationId);
  const enrichment = PARTICIPANT_ENRICHMENT[baseId] ?? {
    courseSchool: `${registration.course} SCMCS`,
    organization: "DominiXode",
    organizationRole: "Organization Member",
    gracePeriodStatus: "On Time",
    attendanceRequirementStatus: "Met Requirement",
    fileStatus: "pending" as FileSubmissionStatus,
  };

  const fileId = "file-1";
  const storedStatus = loadFileStatuses()[`${registrationId}:${fileId}`];
  const fileStatus = storedStatus ?? enrichment.fileStatus ?? "pending";

  return {
    ...registration,
    courseSchool: enrichment.courseSchool,
    organization: enrichment.organization,
    organizationRole: enrichment.organizationRole,
    gracePeriodStatus: enrichment.gracePeriodStatus,
    attendanceRequirementStatus: enrichment.attendanceRequirementStatus,
    files: [
      {
        id: fileId,
        name: requiredFileName,
        viewed: true,
        status: fileStatus,
      },
    ],
  };
}
