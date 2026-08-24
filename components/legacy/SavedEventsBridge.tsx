"use client";

import { useEffect } from "react";
import { getSavedEventIds, setSavedEventIds } from "@/lib/savedEvents";
import { readCachedPortalData } from "@/lib/portal-data-client";

/**
 * Keeps bookmarked event IDs in sync between localStorage and MongoDB
 * on every app surface (student legacy pages and organizer portal).
 */
export function SavedEventsBridge() {
  useEffect(() => {
    let cancelled = false;

    const loadFromApi = async () => {
      const cached = readCachedPortalData();
      if (cached?.savedEventIds?.length) {
        setSavedEventIds(cached.savedEventIds.map(String));
      }

      try {
        const res = await fetch("/api/user/saved-events", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { eventIds?: string[] };
        if (Array.isArray(data.eventIds)) {
          const incoming = data.eventIds.map(String);
          const current = getSavedEventIds();
          const unchanged =
            current.length === incoming.length &&
            current.every((id) => incoming.includes(id));
          if (!unchanged) {
            setSavedEventIds(incoming);
          }
        }
      } catch {
        /* keep local bookmarks */
      }
    };

    const persistToApi = async () => {
      try {
        await fetch("/api/user/saved-events", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventIds: getSavedEventIds() }),
        });
      } catch {
        /* ignore */
      }
    };

    const onSavedChanged = () => {
      void persistToApi();
    };

    void loadFromApi();
    window.addEventListener("dc-saved-changed", onSavedChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("dc-saved-changed", onSavedChanged);
    };
  }, []);

  return null;
}
