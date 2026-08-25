/** Map leftover Figma query values onto live event statuses. */
export function normalizeEventStatusParam(status: string) {
  const value = status.trim().toLowerCase();
  // UI-only mode on edetails14 (eRoomReserve Validated view) = pending review
  if (value === "validated") return "pending";
  if (value === "ongoing") return "live";
  if (value === "complete") return "completed";
  return value;
}

type ListedEvent = { id?: string; status?: string };

const EVENT_LIST_CACHE_MS = 60_000;
let cachedEventList: { events: ListedEvent[]; fetchedAt: number } | null = null;
let eventListInflight: Promise<ListedEvent[]> | null = null;

async function loadEventList() {
  const now = Date.now();
  if (cachedEventList && now - cachedEventList.fetchedAt < EVENT_LIST_CACHE_MS) {
    return cachedEventList.events;
  }
  if (eventListInflight) return eventListInflight;

  eventListInflight = (async () => {
    const res = await fetch("/api/events?limit=80", { cache: "no-store" });
    if (!res.ok) return cachedEventList?.events || [];
    const payload = (await res.json()) as { events?: ListedEvent[] };
    const events = Array.isArray(payload.events) ? payload.events : [];
    cachedEventList = { events, fetchedAt: Date.now() };
    return events;
  })();

  try {
    return await eventListInflight;
  } finally {
    eventListInflight = null;
  }
}

/**
 * Event detail pages in the legacy HTML often link as `?status=pending` with no id.
 * Resolve a real Mongo event so AI + program flow can load.
 */
export async function resolveAdminEventId(id: string, status = "") {
  const fromQuery = id.trim();
  if (fromQuery) return fromQuery;

  const events = await loadEventList();
  const wanted = normalizeEventStatusParam(status);
  const match =
    (wanted ? events.find((event) => String(event.status || "") === wanted) : null) ||
    events[0];
  return String(match?.id || "");
}
