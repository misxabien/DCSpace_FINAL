/** Helpers for matching event organizers across case/id variants. */

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive email match for stored organizerEmail values. */
export function organizerEmailClause(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return { organizerEmail: "__none__" };
  return {
    organizerEmail: {
      $regex: `^${escapeRegex(normalized)}$`,
      $options: "i",
    },
  };
}

/** Filter: events owned by this organizer (id and/or email). */
export function organizerOwnershipFilter(email: string, userId?: string) {
  const clauses: Record<string, unknown>[] = [organizerEmailClause(email)];
  if (userId) {
    clauses.push({ organizerId: userId });
  }
  return { $or: clauses };
}

export function normalizeOrganizerEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function eventOwnedBy(
  event: { organizerEmail?: string; organizerId?: string },
  email: string,
  userId?: string,
) {
  const eventEmail = String(event.organizerEmail || "").trim().toLowerCase();
  const actorEmail = String(email || "").trim().toLowerCase();
  if (eventEmail && actorEmail && eventEmail === actorEmail) return true;
  if (userId && event.organizerId && String(event.organizerId) === String(userId)) {
    return true;
  }
  return false;
}
