import { readAuthSession, authFetch } from "@/lib/user-api";
import type { SanitizedEvent } from "@/lib/events/map-event";

export type PortalPayload = {
  events: SanitizedEvent[];
  registrations: Array<{ eventId: string; status: string; eventTitle?: string }>;
  invitations: Array<{ eventId: string; status: string; eventTitle?: string }>;
  savedEventIds: string[];
  attendance?: Array<{
    id: string;
    eventId: string;
    eventTitle: string;
    action: string;
    scannedAt: string;
    createdAt: string;
    attendanceMinutes: number;
    qualifiedForCertificate: boolean;
    source?: string;
  }>;
  accountEmail?: string;
};

const MEMORY_TTL_MS = 45_000;
const STORAGE_KEY = "dc_portal_data_v1";

let cache: { at: number; data: PortalPayload | null } = { at: 0, data: null };
let inflight: Promise<PortalPayload | null> | null = null;

function accountStorageKey() {
  const session = readAuthSession();
  const email = session?.user.email?.trim().toLowerCase() || "guest";
  return `${STORAGE_KEY}:${email}`;
}

/** Drop inline poster blobs from persisted cache — keep attachment URLs instead. */
function compactForStorage(data: PortalPayload): PortalPayload {
  return {
    ...data,
    events: data.events.map((event) => ({
      ...event,
      posterImage:
        event.posterImage?.startsWith("data:") ? "" : event.posterImage || "",
      // Prefer URL so cards stay light across reloads
      attachments: {
        ...event.attachments,
        poster:
          event.attachments?.poster ||
          (event.hasPoster ? `/api/events/${event.id}/attachments/poster` : ""),
      },
    })),
  };
}

function persistPortalData(data: PortalPayload) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      accountStorageKey(),
      JSON.stringify({ at: Date.now(), data: compactForStorage(data) }),
    );
  } catch {
    /* quota — memory cache still works for this session */
  }
}

/** Synchronous read for instant reload — restores memory cache too. */
export function readCachedPortalData(): PortalPayload | null {
  if (typeof window === "undefined") return null;
  if (cache.data && Date.now() - cache.at < MEMORY_TTL_MS * 20) {
    return cache.data;
  }
  try {
    const raw = window.sessionStorage.getItem(accountStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: PortalPayload };
    if (!parsed?.data?.events) return null;
    cache = { at: parsed.at, data: parsed.data };
    return parsed.data;
  } catch {
    return null;
  }
}

export function isPortalCacheStale(maxAgeMs = MEMORY_TTL_MS) {
  if (!cache.data) return true;
  return Date.now() - cache.at > maxAgeMs;
}

export function invalidatePortalCache(options?: { resetUi?: boolean }) {
  cache = { at: 0, data: null };
  inflight = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(accountStorageKey());

    if (options?.resetUi) {
      // Account switch: drop every account's snapshot so joins never leak across logins.
      const keys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (
          key &&
          (key.startsWith("dc_portal_data_v1") || key.startsWith("dc_events_cards_v1"))
        ) {
          keys.push(key);
        }
      }
      keys.forEach((key) => window.sessionStorage.removeItem(key));
      window.sessionStorage.removeItem("dc_events_cards_v1");
      if (window.DCEvents) {
        window.DCEvents.list = [];
      }
      window.dispatchEvent(new CustomEvent("dc-portal-invalidated"));
    }
  } catch {
    /* ignore */
  }
}

export async function fetchPortalData(force = false): Promise<PortalPayload | null> {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < MEMORY_TTL_MS) {
    return cache.data;
  }
  if (!force && inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const res = await authFetch("/api/user/portal-data", { cache: "no-store" });
      if (!res.ok) return readCachedPortalData();
      const data = (await res.json()) as PortalPayload;
      cache = { at: Date.now(), data };
      persistPortalData(data);
      return data;
    } catch {
      return readCachedPortalData();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
