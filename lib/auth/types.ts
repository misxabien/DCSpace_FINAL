export type Role = "student" | "organizer";

export type SessionUser = {
  email: string;
  name: string;
  role: Role;
  isOrganizer: boolean;
};

export const SESSION_COOKIE = "dc_space_session";
