export type InviteAudience = "student" | "faculty";

export type InviteCandidate = {
  id: string;
  audience: InviteAudience;
  number: string;
  name: string;
  course: string;
  organization: string;
  email?: string;
};

export type InviteResponseStatus = "pending" | "joined";

export type InvitationListEntry = {
  id: string;
  name: string;
  course: string;
  organization: string;
  status: InviteResponseStatus;
};

const INVITE_STORAGE_KEY = "dc_organized_invites_v1";

function loadInviteMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(INVITE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveInviteMap(map: Record<string, boolean>) {
  localStorage.setItem(INVITE_STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event("dc-invites-changed"));
}

function inviteKey(eventId: string, candidateId: string) {
  return `${eventId}:${candidateId}`;
}

export function isCandidateInvited(eventId: string, candidateId: string): boolean {
  return Boolean(loadInviteMap()[inviteKey(eventId, candidateId)]);
}

export function setCandidateInvited(eventId: string, candidateId: string, invited: boolean) {
  const map = loadInviteMap();
  const key = inviteKey(eventId, candidateId);
  if (invited) {
    map[key] = true;
  } else {
    delete map[key];
  }
  saveInviteMap(map);
}

export function setAllInvited(eventId: string, candidateIds: string[], invited: boolean) {
  const map = loadInviteMap();
  for (const candidateId of candidateIds) {
    const key = inviteKey(eventId, candidateId);
    if (invited) {
      map[key] = true;
    } else {
      delete map[key];
    }
  }
  saveInviteMap(map);
}

export const INVITE_FILTER_OPTIONS = ["BSIT", "DominoXode"] as const;
