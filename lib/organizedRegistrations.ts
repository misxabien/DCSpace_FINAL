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

/** @deprecated Mock lists removed — use live API helpers in lib/organized/live.ts */
export function getEventRegistrations(_eventId: string): EventRegistration[] {
  return [];
}

/** @deprecated Mock lists removed — use fetchParticipantDetailLive */
export function getParticipantDetail(
  _eventId: string,
  _registrationId: string,
  _requiredFileName = "Parent's Consent Form",
): ParticipantDetail | null {
  return null;
}

export function saveFileStatus(
  _participantId: string,
  _fileId: string,
  _status: FileSubmissionStatus,
) {
  window.dispatchEvent(new Event("dc-participant-changed"));
}
