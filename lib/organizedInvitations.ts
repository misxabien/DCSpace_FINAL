export type InviteAudience = "student" | "faculty";

export type InviteCandidate = {
  id: string;
  email?: string;
  audience: InviteAudience;
  number: string;
  name: string;
  course: string;
  organization: string;
};

export type InviteResponseStatus = "pending" | "joined";

export type InvitationListEntry = {
  id: string;
  name: string;
  course: string;
  organization: string;
  status: InviteResponseStatus;
};

/** Prototype invite lists removed — use fetchInviteCandidatesLive. */
export function getInviteCandidates(
  _eventId: string,
  _audience: InviteAudience,
): InviteCandidate[] {
  return [];
}

export function isCandidateInvited(_eventId: string, _candidateId: string): boolean {
  return false;
}

export function getInviteState(
  _eventId: string,
  _audience: InviteAudience,
): Record<string, boolean> {
  return {};
}

export function getInvitationList(_eventId: string): InvitationListEntry[] {
  return [];
}

export function setCandidateInvited(
  _eventId: string,
  _candidateId: string,
  _invited: boolean,
) {
  /* no-op: invitations are persisted via /api/organized/events/.../invitations */
}

export function setAllInvited(
  _eventId: string,
  _candidateIds: string[],
  _invited: boolean,
) {
  /* no-op: invitations are persisted via API */
}

export const INVITE_FILTER_OPTIONS = [
  "BSA",
  "BSAIS",
  "BS PSYCH",
  "BEED",
  "BSED",
  "BSIT",
  "BMMA",
  "BA COMM",
  "BSBA",
  "BSTM",
  "BSHM",
  "BSN",
  "BSPT",
  "BSRT",
  "BS PHARM",
  "BSMLS",
  "BS BIO",
] as const;
