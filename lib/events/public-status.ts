import type { EventStatus } from "@/lib/events/types";

/** Event statuses visible to all users for browse, registration, and invitations. */
export const PUBLIC_EVENT_STATUSES = ["approved", "live", "completed"] as const;

export type PublicEventStatus = (typeof PUBLIC_EVENT_STATUSES)[number];

export function isPublicEventStatus(
  status?: string | EventStatus | null,
): status is PublicEventStatus {
  return PUBLIC_EVENT_STATUSES.includes(status as PublicEventStatus);
}
