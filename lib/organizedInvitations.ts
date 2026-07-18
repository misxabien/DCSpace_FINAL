export type InviteAudience = "student" | "faculty";

export type InviteCandidate = {
  id: string;
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

const STUDENT_CANDIDATES: Omit<InviteCandidate, "id" | "audience">[] = [
  {
    number: "20XX-XXXXX",
    name: "Khrystelle Jan Esplana",
    course: "BSIT",
    organization: "DominoXode",
  },
  {
    number: "20XX-XXXXX",
    name: "Misxa Bien Germino",
    course: "BSIT",
    organization: "DominoXode",
  },
  {
    number: "20XX-XXXXX",
    name: "Amira Rachel Marqueses",
    course: "BSIT",
    organization: "DominoXode",
  },
  {
    number: "20XX-XXXXX",
    name: "Gwyneth Ashley Mucio",
    course: "BSIT",
    organization: "DominoXode",
  },
  {
    number: "20XX-XXXXX",
    name: "Paul Andrei Cielo",
    course: "BSIT",
    organization: "DominoXode",
  },
];

const FACULTY_CANDIDATES: Omit<InviteCandidate, "id" | "audience">[] = [
  {
    number: "FAC-1024",
    name: "Prof. Elena Santos",
    course: "BSIT",
    organization: "DominoXode",
  },
  {
    number: "FAC-2041",
    name: "Dr. Marco Reyes",
    course: "BSCS",
    organization: "Tech Guild",
  },
  {
    number: "FAC-1188",
    name: "Ms. Carla Mendoza",
    course: "BSIT",
    organization: "DominoXode",
  },
  {
    number: "FAC-3302",
    name: "Mr. Jonas Villanueva",
    course: "General",
    organization: "Student Affairs",
  },
];

const DEMO_JOIN_STATUS: Record<string, InviteResponseStatus> = {
  "Khrystelle Jan Esplana": "pending",
  "Misxa Bien Germino": "joined",
  "Amira Rachel Marqueses": "pending",
  "Gwyneth Ashley Mucio": "joined",
  "Paul Andrei Cielo": "pending",
};

const INVITE_STORAGE_KEY = "dc_organized_invites_v1";
const JOIN_STATUS_STORAGE_KEY = "dc_organized_invite_status_v1";

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

function loadJoinStatusMap(): Record<string, InviteResponseStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(JOIN_STATUS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, InviteResponseStatus>;
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

function defaultJoinStatus(name: string): InviteResponseStatus {
  return DEMO_JOIN_STATUS[name] ?? "pending";
}

export function getInviteCandidates(eventId: string, audience: InviteAudience): InviteCandidate[] {
  const source = audience === "student" ? STUDENT_CANDIDATES : FACULTY_CANDIDATES;
  return source.map((row, index) => ({
    ...row,
    id: `${eventId}-${audience}-${index + 1}`,
    audience,
  }));
}

export function isCandidateInvited(eventId: string, candidateId: string): boolean {
  return Boolean(loadInviteMap()[inviteKey(eventId, candidateId)]);
}

export function getInviteState(
  eventId: string,
  audience: InviteAudience
): Record<string, boolean> {
  const map = loadInviteMap();
  const candidates = getInviteCandidates(eventId, audience);
  const state: Record<string, boolean> = {};

  for (const candidate of candidates) {
    const key = inviteKey(eventId, candidate.id);
    state[candidate.id] = Boolean(map[key]);
  }

  return state;
}

export function getInvitationList(eventId: string): InvitationListEntry[] {
  const inviteMap = loadInviteMap();
  const joinMap = loadJoinStatusMap();
  const candidates = [
    ...getInviteCandidates(eventId, "student"),
    ...getInviteCandidates(eventId, "faculty"),
  ];

  return candidates
    .filter((candidate) => inviteMap[inviteKey(eventId, candidate.id)])
    .map((candidate) => {
      const key = inviteKey(eventId, candidate.id);
      return {
        id: candidate.id,
        name: candidate.name,
        course: candidate.course,
        organization: candidate.organization,
        status: joinMap[key] ?? defaultJoinStatus(candidate.name),
      };
    });
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
