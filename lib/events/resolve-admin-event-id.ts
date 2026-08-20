/** Map leftover Figma query values onto live event statuses. */
export function normalizeEventStatusParam(status: string) {
  const value = status.trim().toLowerCase();
  if (value === "validated") return "approved";
  if (value === "ongoing") return "live";
  if (value === "complete") return "completed";
  return value;
}

type ListedEvent = { id?: string; status?: string };

/**
 * Event detail pages in the legacy HTML often link as `?status=pending` with no id.
 * Resolve a real Mongo event so AI + program flow can load.
 */
export async function resolveAdminEventId(id: string, status = "") {
  const fromQuery = id.trim();
  if (fromQuery) return fromQuery;

  const res = await fetch("/api/events?limit=80", { cache: "no-store" });
  if (!res.ok) return "";
  const payload = (await res.json()) as { events?: ListedEvent[] };
  const events = Array.isArray(payload.events) ? payload.events : [];
  const wanted = normalizeEventStatusParam(status);
  const match =
    (wanted ? events.find((event) => String(event.status || "") === wanted) : null) ||
    events[0];
  return String(match?.id || "");
}
