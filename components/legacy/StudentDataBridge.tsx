"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  bucketCategory,
  compareEventsForDisplay,
  eventTimingBucket,
  mapDbEventToCard,
  timingToJoinedCategory,
  thematicCategory,
  type LegacyCardEvent,
  type SanitizedEvent,
} from "@/lib/events/map-event";
import { getSavedEventIds, setSavedEventIds } from "@/lib/savedEvents";
import {
  fetchPortalData,
  invalidatePortalCache,
  isPortalCacheStale,
  readCachedPortalData,
  type PortalPayload,
} from "@/lib/portal-data-client";
import { preloadImageUrls } from "@/lib/image-preload";
import { authFetch, readAuthSession } from "@/lib/user-api";

function cardsStorageKey() {
  const session = readAuthSession();
  const email = session?.user.email?.trim().toLowerCase() || "guest";
  return `dc_events_cards_v1:${email}`;
}

declare global {
  interface Window {
    __dcNavigate?: (href: string) => void;
    DCEvents?: {
      list: unknown[];
      attendanceRfid?: Record<string, unknown>;
      getEventById?: (id: string | number) => unknown;
      getEventsByCategory?: (category: string, limit?: number) => unknown[];
      fillContainer?: (
        id: string,
        options: {
          ids?: Array<string | number>;
          category?: string;
          limit?: number;
          detailContext?: string;
        },
      ) => void;
      fillSavedContainer?: (
        id: string,
        options?: { timing?: string; detailContext?: string; limit?: number },
      ) => void;
      showEmptyState?: (
        id: string | HTMLElement,
        options?: {
          emptyTitle?: string;
          emptyDescription?: string;
          compactEmpty?: boolean;
          category?: string;
          timing?: string;
        },
      ) => void;
      upsertEvent?: (event: unknown) => void;
      renderDetailContent?: (event: unknown) => void;
      renderEventDetails?: () => void;
      renderExploreDetails?: () => void;
      renderAttendanceDetails?: () => void;
      renderSubmitPage?: () => void;
    };
    DCFeedback?: {
      FEEDBACK_ITEMS: unknown[];
      getFeedbackById?: (id: string | number) => unknown;
      renderFeedbackDetails?: () => void;
    };
    DCCertificates?: {
      list: unknown[];
      getCertificatesByCategory?: (category: string, limit?: number) => unknown[];
      fillCertificateContainer?: (
        id: string,
        categoryOrOptions: string | { category?: string; limit?: number },
        limit?: number,
      ) => void;
    };
  }
}

const EVENT_GRID_CONFIG: Array<{
  id: string;
  category?: string;
  limit?: number;
  detailContext: string;
}> = [
  { id: "row-today", category: "today", limit: 12, detailContext: "explore" },
  { id: "row-academic", category: "academic", limit: 12, detailContext: "explore" },
  { id: "row-tech", category: "tech", limit: 12, detailContext: "explore" },
  { id: "row-org", category: "organization", limit: 12, detailContext: "explore" },
  { id: "attendance-today-grid", category: "attendance-today", limit: 12, detailContext: "attendance" },
  { id: "attendance-completed-grid", category: "attendance-completed", limit: 12, detailContext: "attendance" },
  { id: "attendance-incomplete-grid", category: "attendance-incomplete", limit: 12, detailContext: "attendance" },
  { id: "home-invited-grid", category: "invited", limit: 12, detailContext: "explore" },
  { id: "home-today-grid", category: "joined-today", limit: 12, detailContext: "joined" },
  { id: "home-upcoming-grid", category: "joined-upcoming", limit: 12, detailContext: "joined" },
  { id: "home-past-grid", category: "joined-past", limit: 12, detailContext: "joined" },
];

function categoryForPath(pathname: string): { category: string; detailContext: string } | null {
  if (pathname.startsWith("/events/happening")) {
    return { category: "today", detailContext: "explore" };
  }
  if (pathname.startsWith("/events/academic")) {
    return { category: "academic", detailContext: "explore" };
  }
  if (pathname.startsWith("/events/tech")) {
    return { category: "tech", detailContext: "explore" };
  }
  if (pathname.startsWith("/events/organization")) {
    return { category: "organization", detailContext: "explore" };
  }
  if (pathname.startsWith("/events/past")) {
    return { category: "joined-past", detailContext: "joined" };
  }
  if (pathname.startsWith("/events/upcoming")) {
    return { category: "joined-upcoming", detailContext: "joined" };
  }
  if (pathname.startsWith("/events/today")) {
    return { category: "joined-today", detailContext: "joined" };
  }
  if (pathname.startsWith("/events/invited")) {
    return { category: "invited", detailContext: "explore" };
  }
  if (pathname.startsWith("/attendance/completed")) {
    return { category: "attendance-completed", detailContext: "attendance" };
  }
  if (pathname.startsWith("/attendance/incomplete")) {
    return { category: "attendance-incomplete", detailContext: "attendance" };
  }
  return null;
}

async function fetchAttendanceBuckets() {
  try {
    const res = await fetch("/api/user/attendance", { cache: "no-store" });
    if (!res.ok) return new Map<string, "attendance-completed" | "attendance-incomplete" | "attendance-today">();
    const data = (await res.json()) as {
      attendance?: Array<{
        eventId?: string;
        action?: string;
        qualifiedForCertificate?: boolean;
      }>;
    };
    const buckets = new Map<
      string,
      "attendance-completed" | "attendance-incomplete" | "attendance-today"
    >();
    for (const row of data.attendance || []) {
      const eventId = String(row.eventId || "");
      if (!eventId) continue;
      if (row.qualifiedForCertificate || row.action === "out") {
        buckets.set(eventId, "attendance-completed");
        continue;
      }
      if (row.action === "in" && buckets.get(eventId) !== "attendance-completed") {
        buckets.set(eventId, "attendance-incomplete");
      }
    }
    return buckets;
  } catch {
    return new Map<string, "attendance-completed" | "attendance-incomplete" | "attendance-today">();
  }
}

function applyAttendanceCategories(
  events: LegacyCardEvent[],
  buckets: Map<string, "attendance-completed" | "attendance-incomplete" | "attendance-today">,
) {
  return events.map((event) => {
    const bucket = buckets.get(String(event.id));
    if (bucket) return { ...event, category: bucket };
    if (event.category === "today") {
      return { ...event, category: "attendance-today" };
    }
    return event;
  });
}

function tagsForApprovedEvent(
  event: SanitizedEvent,
  invited: boolean,
  isJoined: boolean,
) {
  const timing = eventTimingBucket(event.startsAt, event.status);
  const theme = thematicCategory(event);
  const tags = new Set<string>();

  // Browse / Explore — every admin-approved event from every organizer
  tags.add(timing);
  if (timing !== "past") tags.add("browse");
  if (theme) tags.add(theme);
  if (timing === "today") tags.add("today");

  // Home "Events Joined" — only when this user actually registered
  if (isJoined) {
    tags.add(timingToJoinedCategory(timing));
  }

  if (invited) tags.add("invited");

  return Array.from(tags);
}

function updateSavedPageEmptyState() {
  const pageEmpty = document.getElementById("saved-page-empty");
  const sections = document.getElementById("saved-sections");
  if (!pageEmpty || !sections) return;

  const hasSaved = getSavedEventIds().length > 0;
  pageEmpty.classList.toggle("is-visible", !hasSaved);
  sections.classList.toggle("is-hidden", !hasSaved);

  const searchBar = document.querySelector(".search-bar");
  if (searchBar instanceof HTMLElement) {
    searchBar.hidden = !hasSaved;
  }

  const sectionEmpties: Array<[string, string]> = [
    ["saved-today-empty", "saved-today-grid"],
    ["saved-upcoming-empty", "saved-upcoming-grid"],
    ["saved-past-empty", "saved-past-grid"],
  ];
  sectionEmpties.forEach(([emptyId, gridId]) => {
    const empty = document.getElementById(emptyId);
    const grid = document.getElementById(gridId);
    if (empty && grid) {
      empty.hidden = grid.children.length > 0;
    }
  });
}

function refreshSavedViews() {
  if (!window.DCEvents?.fillSavedContainer) return;

  const grids: Array<{
    id: string;
    options: { timing?: string; limit?: number; detailContext: string };
  }> = [
    { id: "saved-grid", options: { detailContext: "explore" } },
    { id: "saved-today-grid", options: { timing: "today", limit: 2, detailContext: "explore" } },
    { id: "saved-upcoming-grid", options: { timing: "upcoming", limit: 2, detailContext: "explore" } },
    { id: "saved-past-grid", options: { timing: "past", limit: 2, detailContext: "explore" } },
  ];

  grids.forEach(({ id, options }) => {
    if (!document.getElementById(id)) return;
    try {
      window.DCEvents?.fillSavedContainer?.(id, options);
    } catch {
      /* ignore */
    }
  });

  updateSavedPageEmptyState();
}

async function hydrateEventDetailPage(pathname: string) {
  if (!pathname.startsWith("/events/details") && !pathname.startsWith("/events/explore")) {
    return false;
  }
  const detailId = new URLSearchParams(window.location.search).get("id");
  if (!detailId || !window.DCEvents) return false;

  // Instant paint from whatever we already have in memory / cache.
  const existing = window.DCEvents.getEventById?.(detailId) as LegacyCardEvent | null;
  if (existing) {
    renderLegacyDetailViews(pathname);
  }

  try {
    const res = await authFetch(`/api/events/${encodeURIComponent(detailId)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      if (!existing) markDetailMissing();
      return false;
    }
    const payload = (await res.json()) as { event?: SanitizedEvent };
    if (!payload.event) {
      if (!existing) markDetailMissing();
      return false;
    }

    const card = mapDbEventToCard(payload.event, bucketCategory(payload.event));
    const merged = existing
      ? {
          ...card,
          category: existing.category,
          tags: existing.tags,
          status: existing.status,
          filesApproved: existing.filesApproved,
        }
      : card;

    window.DCEvents.upsertEvent?.(merged);
    preloadImageUrls([merged.imageUrl]);
    return true;
  } catch {
    if (!existing) markDetailMissing();
    return false;
  }
}

function markDetailMissing() {
  document.body.classList.add("detail-page--missing");
  const title = document.getElementById("detail-title");
  if (title) title.textContent = "Event Not Found";
  const action = document.getElementById("detail-action");
  if (action) action.hidden = true;
}

function renderLegacyDetailViews(pathname: string) {
  if (pathname.startsWith("/events/details") && window.DCEvents?.renderEventDetails) {
    window.DCEvents.renderEventDetails();
  }
  if (pathname.startsWith("/events/explore") && window.DCEvents?.renderExploreDetails) {
    window.DCEvents.renderExploreDetails();
  }
  if (pathname.startsWith("/attendance/details") && window.DCEvents?.renderAttendanceDetails) {
    window.DCEvents.renderAttendanceDetails();
  }
  if (pathname.startsWith("/events/submit") && window.DCEvents?.renderSubmitPage) {
    window.DCEvents.renderSubmitPage();
  }
}

function refreshLegacyEventViews(pathname: string) {
  if (!window.DCEvents) return;

  EVENT_GRID_CONFIG.forEach(({ id, category, limit, detailContext }) => {
    if (!document.getElementById(id)) return;
    try {
      window.DCEvents?.fillContainer?.(id, { category, limit, detailContext });
    } catch {
      /* ignore */
    }
  });

  const pathFilter = categoryForPath(pathname);
  if (document.getElementById("event-grid") && pathFilter) {
    try {
      window.DCEvents?.fillContainer?.("event-grid", {
        category: pathFilter.category,
        limit: 50,
        detailContext: pathFilter.detailContext,
      });
    } catch {
      /* ignore */
    }
  }

  if (pathname.startsWith("/saved")) {
    refreshSavedViews();
  }

  const isDetailPage =
    pathname.startsWith("/events/details") || pathname.startsWith("/events/explore");

  if (isDetailPage) {
    renderLegacyDetailViews(pathname);
    void hydrateEventDetailPage(pathname).then((hydrated) => {
      if (hydrated) renderLegacyDetailViews(pathname);
    });
    return;
  }

  renderLegacyDetailViews(pathname);
}

function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "00:00 AM";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Just now";
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function isSameDay(iso: string, offsetDays = 0) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const target = new Date();
  target.setDate(target.getDate() + offsetDays);
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  );
}

function notifIconClass(type: string) {
  if (type === "invitation") return "notif-item__icon notif-item__icon--cyan";
  if (type === "certificate") return "notif-item__icon notif-item__icon--gold";
  if (type === "event-status") return "notif-item__icon notif-item__icon--red";
  return "notif-item__icon notif-item__icon--blue";
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Syncs student legacy pages with Mongo-backed APIs without redesigning UI.
 */
export function StudentDataBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const listenersWired = useRef(false);

  useEffect(() => {
    window.__dcNavigate = (href: string) => {
      router.push(href);
    };
    return () => {
      if (window.__dcNavigate) delete window.__dcNavigate;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const onSoftNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ href?: string }>).detail || {};
      const href = String(detail.href || "");
      if (!href) return;
      event.preventDefault();
      router.push(href);
    };

    const mapPortalToLive = (data: PortalPayload) => {
      const joined = new Map(
        (data.registrations || []).map((row) => [
          String(row.eventId || ""),
          String(row.status || "joined"),
        ]),
      );
      const invited = new Set(
        (data.invitations || [])
          .filter((row) => String(row.status || "pending") !== "joined")
          .map((row) => String(row.eventId || "")),
      );

      return (data.events || [])
        .map((event): LegacyCardEvent => {
        const registrationStatus = joined.get(String(event.id));
        const isJoined = Boolean(registrationStatus);
        const timing = eventTimingBucket(event.startsAt, event.status);
        const theme = thematicCategory(event);
        const card = mapDbEventToCard(event, bucketCategory(event));
        const tags = tagsForApprovedEvent(event, invited.has(card.id), isJoined);
        return {
          ...card,
          category: isJoined
            ? timingToJoinedCategory(timing)
            : theme || (timing === "today" ? "today" : timing),
          tags,
          status:
            registrationStatus === "pending"
              ? "pending"
              : registrationStatus
                ? "joined"
                : card.status,
        };
      })
        .sort((a, b) =>
          compareEventsForDisplay(
            { startsAt: a.date, status: a.dbStatus || a.status, name: a.name },
            { startsAt: b.date, status: b.dbStatus || b.status, name: b.name },
          ),
        );
    };

    const commitLiveEvents = (live: LegacyCardEvent[]) => {
      if (!window.DCEvents || cancelled) return;
      window.DCEvents.list = live;
      try {
        window.sessionStorage.setItem(
          cardsStorageKey(),
          JSON.stringify(
            live.map((event) => ({
              ...event,
              imageUrl: event.imageUrl?.startsWith("data:") ? "" : event.imageUrl,
            })),
          ),
        );
      } catch {
        /* quota */
      }
      preloadImageUrls(live.map((event) => event.imageUrl));
      refreshLegacyEventViews(pathname);
      window.dispatchEvent(new CustomEvent("dc-events-ready"));
    };

    const hydrateFromPortal = async (data: PortalPayload, enrich = true) => {
      if (!window.DCEvents || cancelled) return;

      if (Array.isArray(data.savedEventIds)) {
        setSavedEventIds(data.savedEventIds.map(String));
      }

      let live: LegacyCardEvent[] = mapPortalToLive(data);

      if (pathname.startsWith("/attendance")) {
        const buckets = await fetchAttendanceBuckets();
        live = applyAttendanceCategories(live, buckets);
      }

      if (!enrich) {
        commitLiveEvents(live);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const detailId = params.get("id");
      if (detailId) {
        try {
          const one = await authFetch(`/api/events/${encodeURIComponent(detailId)}`, {
            cache: "no-store",
          });
          if (one.ok) {
            const payload = (await one.json()) as { event?: SanitizedEvent };
            if (payload.event) {
              const full = mapDbEventToCard(payload.event, bucketCategory(payload.event));
              const index = live.findIndex((event) => String(event.id) === detailId);
              if (index >= 0) {
                live[index] = {
                  ...full,
                  category: live[index].category,
                  tags: live[index].tags,
                  status: live[index].status,
                  filesApproved: live[index].filesApproved,
                };
              } else {
                live = [full, ...live];
              }
            }
          }
        } catch {
          /* keep list entry */
        }
      }

      const savedIds = getSavedEventIds();
      const missingSavedIds = savedIds.filter(
        (id) => !live.some((event) => String(event.id) === id),
      );
      if (missingSavedIds.length > 0) {
        const fetched = await Promise.all(
          missingSavedIds.map(async (id) => {
            try {
              const res = await authFetch(`/api/events/${encodeURIComponent(id)}`, {
                cache: "no-store",
              });
              if (!res.ok) return null;
              const payload = (await res.json()) as { event?: SanitizedEvent };
              if (!payload.event) return null;
              return mapDbEventToCard(payload.event, bucketCategory(payload.event));
            } catch {
              return null;
            }
          }),
        );
        live = [...live, ...fetched.filter((event): event is LegacyCardEvent => Boolean(event))];
      }

      commitLiveEvents(live);
    };

    const injectEvents = async (force = false) => {
      if (!window.DCEvents) return;

      // Restore last mapped cards instantly so detail clicks never wait on the network.
      if (!force && window.DCEvents.list.length === 0) {
        try {
          const raw = window.sessionStorage.getItem(cardsStorageKey());
          if (raw) {
            const cards = JSON.parse(raw) as LegacyCardEvent[];
            if (Array.isArray(cards) && cards.length) {
              window.DCEvents.list = cards;
              refreshLegacyEventViews(pathname);
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (!force && window.DCEvents.list.length > 0) {
        refreshLegacyEventViews(pathname);
      }

      // Detail pages: fetch the single event in parallel with portal refresh.
      if (
        pathname.startsWith("/events/details") ||
        pathname.startsWith("/events/explore")
      ) {
        void hydrateEventDetailPage(pathname).then((hydrated) => {
          if (hydrated && !cancelled) renderLegacyDetailViews(pathname);
        });
      }

      const cached = !force ? readCachedPortalData() : null;
      if (!force && cached && window.DCEvents.list.length === 0) {
        await hydrateFromPortal(cached, false);
      } else if (!force && cached && window.DCEvents.list.length > 0) {
        // Keep UI responsive; refresh portal in background.
      }

      if (!force && cached && !isPortalCacheStale()) {
        void fetchPortalData(false).then((fresh) => {
          if (fresh && !cancelled) void hydrateFromPortal(fresh, true);
        });
        return;
      }

      try {
        const data = await fetchPortalData(force);
        if (!data || cancelled) {
          if (!cancelled && window.DCEvents && window.DCEvents.list.length === 0) {
            refreshLegacyEventViews(pathname);
          }
          return;
        }

        await hydrateFromPortal(data, true);
      } catch {
        if (!cancelled && window.DCEvents && window.DCEvents.list.length === 0) {
          refreshLegacyEventViews(pathname);
        }
      }
    };

    const hydrateStudentHomeAi = async () => {
      if (pathname !== "/home") return;
      const greeting =
        document.querySelector(".main__greeting") || document.querySelector(".joined-head");
      if (!greeting || greeting.parentElement?.querySelector("[data-dc-ai-home]")) return;

      try {
        const res = await fetch("/api/ai/student-home", {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await res.json().catch(() => ({}));
        const insight = String(payload.insight || "").trim();
        if (!res.ok || !insight) return;
        const note = document.createElement("p");
        note.dataset.dcAiHome = "1";
        note.textContent = insight;
        note.style.cssText = "margin:8px 0 0;max-width:42rem;color:#4a5a78;font-size:0.95rem;line-height:1.45;";
        greeting.insertAdjacentElement("afterend", note);
      } catch {
        /* home still works without AI */
      }
    };

    const onEventsReady = () => {
      refreshLegacyEventViews(pathname);
      if (pathname.startsWith("/saved")) {
        refreshSavedViews();
      }
    };

    window.addEventListener("dc-events-ready", onEventsReady);

    const wireFeedbackForm = () => {
      if (pathname !== "/feedback/sign") return;
      const form = document.getElementById("feedback-form") as HTMLFormElement | null;
      if (!form || form.dataset.dcWired === "1") return;
      form.dataset.dcWired = "1";

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const fd = new FormData(form);
        const title = String(fd.get("title") || "").trim();
        const type = String(fd.get("type") || "General Feedback").trim();
        const rating = Number(fd.get("rating") || 0);
        const comment = String(fd.get("comment") || "").trim();
        if (!title || rating < 1) return;
        const mediaInput = document.getElementById("media-input") as HTMLInputElement | null;
        const mediaFiles = Array.from(mediaInput?.files || []).slice(0, 6);
        const media = [];
        for (const file of mediaFiles) {
          if (!file.type.startsWith("image/")) continue;
          media.push({
            name: file.name,
            mimeType: file.type,
            dataUrl: await fileToDataUrl(file),
          });
        }

        try {
          const res = await fetch("/api/user/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, type, rating, comment, media }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            window.alert(err.error || "Failed to submit feedback.");
            return;
          }
          const overlay = document.getElementById("success-overlay");
          if (overlay) {
            overlay.hidden = false;
            overlay.removeAttribute("hidden");
          } else {
            window.alert("Feedback submitted.");
            window.location.assign("/feedback");
          }
        } catch {
          window.alert("Failed to submit feedback.");
        }
      }, true);
    };

    const wireAttendanceTap = () => {
      if (!pathname.startsWith("/attendance")) return;
      const params = new URLSearchParams(window.location.search);
      const eventId = params.get("id");
      if (!eventId) return;

      if (pathname === "/attendance/details") {
        const footer = document.querySelector(".rfid-panel__footer");
        if (footer && !document.getElementById("dc-tap-out-btn")) {
          const button = document.createElement("button");
          button.type = "button";
          button.id = "dc-tap-out-btn";
          button.className = "rfid-sort__btn is-active";
          button.textContent = "Tap Out";
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              const res = await fetch("/api/user/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  eventId,
                  eventName:
                    document.getElementById("detail-name")?.textContent || "",
                  action: "out",
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                window.alert(data.error || "Failed to tap out.");
                return;
              }
              if (data.certificate?.id) {
                window.alert(
                  "Attendance completed. Your certificate is now available in Certificates.",
                );
              } else {
                window.alert("Tap out recorded.");
              }
              window.location.assign("/certificates");
            } catch {
              window.alert("Failed to tap out.");
            } finally {
              button.disabled = false;
            }
          });
          footer.prepend(button);
        }

        void fetch("/api/user/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            eventName: document.getElementById("detail-name")?.textContent || "",
            action: "in",
          }),
        }).catch(() => undefined);
      }
    };

    const injectAttendanceRfid = async () => {
      if (pathname !== "/attendance/details" || !window.DCEvents) return;
      const eventId = new URLSearchParams(window.location.search).get("id");
      if (!eventId) return;
      try {
        const res = await fetch(`/api/user/attendance?eventId=${encodeURIComponent(eventId)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          attendance?: Array<{
            action?: string;
            createdAt?: string;
            scannedAt?: string;
            attendanceMinutes?: number;
            qualifiedForCertificate?: boolean;
          }>;
        };
        const rows = [...(data.attendance || [])].reverse();
        const logs: Array<{ tapIn: string; tapOut: string }> = [];
        let openIn = "";
        let lastMinutes = 0;
        let qualified = false;
        for (const row of rows) {
          const stamp = String(row.scannedAt || row.createdAt || "");
          if (row.action === "in") {
            if (openIn) logs.push({ tapIn: formatClock(openIn), tapOut: "00:00 PM" });
            openIn = stamp;
          } else {
            logs.push({
              tapIn: formatClock(openIn || stamp),
              tapOut: formatClock(stamp),
            });
            openIn = "";
            lastMinutes = Number(row.attendanceMinutes || lastMinutes);
            qualified = Boolean(row.qualifiedForCertificate || qualified);
          }
        }
        if (openIn) logs.push({ tapIn: formatClock(openIn), tapOut: "00:00 PM" });
        while (logs.length < 5) logs.push({ tapIn: "00:00 AM", tapOut: "00:00 PM" });

        const event = window.DCEvents.getEventById?.(eventId) as
          | { attendanceRequired?: string; gracePeriod?: string }
          | undefined;
        const required = Number(String(event?.attendanceRequired || "30").replace(/\D/g, "")) || 30;
        const progress = qualified ? 100 : Math.min(100, Math.round((lastMinutes / required) * 100));

        window.DCEvents.attendanceRfid = {
          ...(window.DCEvents.attendanceRfid || {}),
          [eventId]: {
            graceRemaining: openIn ? event?.gracePeriod || "15:00" : "00:00",
            progress,
            logs: logs.slice(0, 8),
            page: { current: logs.some((row) => row.tapIn !== "00:00 AM") ? 1 : 0, total: 1 },
          },
        };
        window.DCEvents.renderAttendanceDetails?.();
      } catch {
        if (window.DCEvents) {
          window.DCEvents.attendanceRfid = {
            ...(window.DCEvents.attendanceRfid || {}),
            [eventId]: {
              graceRemaining: "00:00",
              progress: 0,
              logs: [],
              page: { current: 0, total: 1 },
            },
          };
          window.DCEvents.renderAttendanceDetails?.();
        }
      }
    };

    const injectFeedbackList = async () => {
      if (!pathname.startsWith("/feedback")) return;
      if (window.DCFeedback) {
        window.DCFeedback.FEEDBACK_ITEMS = [];
      }
      try {
        const res = await fetch("/api/user/feedback?mine=1", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          feedback?: Array<{
            id: string;
            title: string;
            type: string;
            rating: number;
            comment: string;
            createdAt: string;
          }>;
        };
        const items = data.feedback || [];
        if (window.DCFeedback) {
          window.DCFeedback.FEEDBACK_ITEMS = items.map((f) => ({
            id: f.id,
            listTitle: f.title,
            listType: f.type,
            title: f.title,
            type: f.type,
            rating: f.rating,
            submittedAt: f.createdAt
              ? new Date(f.createdAt).toLocaleString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "",
            comment: f.comment,
            media: [],
          }));
        }

        const list = document.getElementById("feedback-list");
        if (list) {
          list.querySelectorAll(".dc-empty-state").forEach((el) => el.remove());
          const lis = Array.from(list.querySelectorAll<HTMLLIElement>("li"));
          if (!items.length) {
            lis.forEach((li) => {
              li.style.display = "none";
            });
            if (!list.querySelector(".dc-empty-state") && window.DCEvents?.showEmptyState) {
              window.DCEvents.showEmptyState(list, {
                emptyTitle: "No feedback submitted yet.",
                emptyDescription:
                  "Feedback you send from Submit Feedback will appear here.",
                compactEmpty: true,
              });
            }
          } else {
            items.forEach((f, index) => {
              let li = lis[index];
              if (!li && lis[0]) {
                li = lis[0].cloneNode(true) as HTMLLIElement;
                list.appendChild(li);
              }
              if (!li) return;
              li.style.display = "";
              const btn = li.querySelector<HTMLButtonElement>(".feedback-item");
              if (btn) btn.setAttribute("data-feedback-id", f.id);
              const title = li.querySelector(".feedback-item__title");
              const type = li.querySelector(".feedback-item__type");
              if (title) title.textContent = f.title;
              if (type) type.textContent = f.type;
            });
            list.querySelectorAll<HTMLLIElement>("li").forEach((li, index) => {
              if (index >= items.length) li.style.display = "none";
            });
          }
        }

        if (pathname.startsWith("/feedback/details")) {
          window.DCFeedback?.renderFeedbackDetails?.();
        }
      } catch {
        if (window.DCFeedback) {
          window.DCFeedback.FEEDBACK_ITEMS = [];
        }
        const list = document.getElementById("feedback-list");
        if (list) {
          list.querySelectorAll<HTMLLIElement>("li").forEach((li) => {
            li.style.display = "none";
          });
        }
      }
    };

    const injectCertificates = async () => {
      if (!pathname.startsWith("/certificates")) return;
      if (window.DCCertificates) {
        window.DCCertificates.list = [];
      }
      try {
        const res = await fetch("/api/user/certificates", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          certificates?: Array<{
            id: string;
            name: string;
            eventName: string;
            dateIssued: string;
            category: string;
            downloadUrl?: string;
          }>;
        };
        const certs = data.certificates || [];
        if (!window.DCCertificates) return;
        window.DCCertificates.list = certs;
        ["cert-today-grid", "cert-weekend-grid", "cert-month-grid", "cert-grid"].forEach(
          (id) => {
            if (!document.getElementById(id)) return;
            try {
              window.DCCertificates?.fillCertificateContainer?.(
                id,
                id.includes("today")
                  ? "cert-today"
                  : id.includes("weekend")
                    ? "cert-weekend"
                    : "cert-month",
                12,
              );
            } catch {
              /* ignore */
            }
          },
        );
      } catch {
        if (window.DCCertificates) {
          window.DCCertificates.list = [];
          ["cert-today-grid", "cert-weekend-grid", "cert-month-grid", "cert-grid"].forEach(
            (id) => {
              try {
                window.DCCertificates?.fillCertificateContainer?.(
                  id,
                  id.includes("today")
                    ? "cert-today"
                    : id.includes("weekend")
                      ? "cert-weekend"
                      : "cert-month",
                  12,
                );
              } catch {
                const host = document.getElementById(id);
                if (host) host.innerHTML = "";
              }
            },
          );
        }
      }
    };

    const injectNotifications = async () => {
      if (pathname !== "/notifications") return;
      try {
        const res = await fetch("/api/user/notifications", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          notifications?: Array<{
            id: string;
            title: string;
            body: string;
            type: string;
            eventId?: string;
            read: boolean;
            createdAt: string;
          }>;
        };
        const items = data.notifications || [];
        const todayList = document.getElementById("notif-today-list");
        const yesterdayList = document.getElementById("notif-yesterday-list") ||
          document.querySelector('[data-group="yesterday"] .notif-list');
        if (!todayList) return;

        const renderList = (
          host: Element,
          rows: typeof items,
        ) => {
          if (!rows.length) {
            host.innerHTML = "";
            return;
          }
          host.innerHTML = rows
            .map((item) => {
              const highlighted = item.read ? "" : " is-highlighted";
              const tags = item.read ? "all recent" : "all recent unread";
              return `<li>
                <button type="button" class="notif-item${highlighted}" data-notif-id="${item.id}" data-event-id="${item.eventId || ""}" data-filter-tags="${tags}" data-search="${item.title} ${item.body}">
                  <span class="${notifIconClass(item.type)}" aria-hidden="true">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  </span>
                  <span class="notif-item__body">
                    <span class="notif-item__title">${item.title}</span>
                    <span class="notif-item__desc">${item.body}</span>
                  </span>
                  <span class="notif-item__time">${timeAgo(item.createdAt)}</span>
                </button>
              </li>`;
            })
            .join("");
        };

        renderList(todayList, items.filter((item) => isSameDay(item.createdAt)));
        if (yesterdayList) {
          renderList(
            yesterdayList,
            items.filter((item) => !isSameDay(item.createdAt)),
          );
        }

        const empty = document.getElementById("notif-empty");
        if (empty) empty.hidden = items.length > 0;

        if (todayList.dataset.dcWired !== "1") {
          todayList.dataset.dcWired = "1";
          document.addEventListener("click", (event) => {
            const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".notif-item");
            if (!btn) return;
            const id = btn.getAttribute("data-notif-id");
            const eventId = btn.getAttribute("data-event-id");
            if (id) {
              void fetch("/api/user/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, read: true }),
              });
            }
            if (eventId) {
              window.location.assign(`/events/explore?id=${encodeURIComponent(eventId)}`);
            }
          });
        }
      } catch {
        /* keep static markup */
      }
    };

    const joinEvent = async (eventId: string, eventTitle: string, files?: unknown[]) => {
      const res = await authFetch("/api/user/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          eventTitle,
          files,
          status: files?.length ? "pending" : "joined",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to join event.");
      }
      return data as {
        registration?: { status?: string };
        registrationCount?: number;
        duplicate?: boolean;
      };
    };

    const markLocalRegistration = (
      eventId: string,
      status: "joined" | "pending",
    ) => {
      if (!window.DCEvents?.list) return;
      const list = window.DCEvents.list as LegacyCardEvent[];
      const next = list.map((event) => {
        if (String(event.id) !== eventId) return event;
        const timing = eventTimingBucket(event.date, event.dbStatus || event.status);
        const joinedCategory = timingToJoinedCategory(timing);
        const tags = new Set(Array.isArray(event.tags) ? event.tags : []);
        tags.add(joinedCategory);
        tags.add(timing);
        return {
          ...event,
          status,
          category: joinedCategory,
          tags: Array.from(tags),
        };
      });
      window.DCEvents.list = next;
      try {
        window.sessionStorage.setItem(
          cardsStorageKey(),
          JSON.stringify(
            next.map((event) => ({
              ...event,
              imageUrl: event.imageUrl?.startsWith("data:") ? "" : event.imageUrl,
            })),
          ),
        );
      } catch {
        /* ignore */
      }
    };

    const showRegisteredBanner = (message: string) => {
      let wrap = document.getElementById("detail-status-wrap");
      let status = document.getElementById("detail-status");
      if (!wrap) {
        const page = document.querySelector(".detail-page");
        if (page) {
          wrap = document.createElement("div");
          wrap.id = "detail-status-wrap";
          wrap.className = "detail-status-wrap";
          wrap.innerHTML = `<p id="detail-status" class="detail-status"></p>`;
          const actionWrap = page.querySelector(".detail-action-wrap");
          if (actionWrap) page.insertBefore(wrap, actionWrap);
          else page.appendChild(wrap);
          status = wrap.querySelector("#detail-status");
        }
      }
      if (status) status.textContent = message;
      if (wrap) wrap.hidden = false;
    };

    const onJoinEvent = async (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string; eventTitle?: string }>).detail || {};
      const eventId = String(detail.eventId || "");
      if (!eventId) return;
      const actionBtn = document.getElementById("detail-action") as HTMLButtonElement | null;
      if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.textContent = "Joining…";
      }
      try {
        const result = await joinEvent(eventId, String(detail.eventTitle || ""));
        const status =
          result.registration?.status === "pending" ? "pending" : "joined";
        markLocalRegistration(eventId, status);
        invalidatePortalCache();
        if (actionBtn) {
          actionBtn.textContent =
            status === "pending" ? "Registration Pending" : "You Are Registered";
          actionBtn.className =
            status === "pending"
              ? "detail-action detail-action--pending"
              : "detail-action detail-action--joined";
          actionBtn.disabled = true;
        }
        showRegisteredBanner(
          status === "pending"
            ? "Registration pending file approval"
            : "You are registered for this event",
        );
        window.DCEvents?.renderExploreDetails?.();
        window.DCEvents?.renderEventDetails?.();
        await injectEvents(true);
        window.DCEvents?.renderExploreDetails?.();
        window.DCEvents?.renderEventDetails?.();
        window.dispatchEvent(new CustomEvent("dc-events-ready"));
        if (typeof result.registrationCount === "number") {
          console.info(
            `[DC Space] Registered. Event now has ${result.registrationCount} student(s).`,
          );
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Failed to join event.");
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.textContent = "Join This Event";
        }
      }
    };

    const onSubmitEvent = async (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string; eventTitle?: string }>).detail || {};
      const eventId = String(detail.eventId || "");
      if (!eventId) return;
      const submitBtn = document.getElementById("submit-action") as HTMLButtonElement | null;
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>(".submit-file-row__input"),
      );
      try {
        const files = [];
        for (const [index, input] of inputs.entries()) {
          const file = input.files?.[0];
          if (!file) continue;
          const dataUrl = await fileToDataUrl(file);
          files.push({
            id: `file-${index + 1}`,
            name:
              document.querySelectorAll(".submit-file-row__name")[index]?.textContent ||
              file.name,
            fileName: file.name,
            mimeType: file.type,
            base64: dataUrl,
            status: "pending",
          });
        }
        await joinEvent(eventId, String(detail.eventTitle || ""), files);
        markLocalRegistration(eventId, "pending");
        invalidatePortalCache();
        if (submitBtn) {
          submitBtn.textContent = "Registration Pending";
          submitBtn.disabled = true;
          submitBtn.className = "detail-action detail-action--pending";
        }
        void injectEvents(true);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Failed to submit registration.");
      }
    };

    window.addEventListener("dc-events-ready", onEventsReady);
    window.addEventListener("dc-navigate", onSoftNavigate as EventListener);
    const onPortalInvalidated = () => {
      void injectEvents(true);
    };
    window.addEventListener("dc-portal-invalidated", onPortalInvalidated);
    if (!listenersWired.current) {
      listenersWired.current = true;
      window.addEventListener("dc-join-event", onJoinEvent as EventListener);
      window.addEventListener("dc-submit-event", onSubmitEvent as EventListener);
    }

    const runPageHooks = () => {
      wireFeedbackForm();
      wireAttendanceTap();
      void injectAttendanceRfid();
      void injectFeedbackList();
      void injectCertificates();
      void injectNotifications();
    };

    async function bootstrap() {
      for (let i = 0; i < 40 && !window.DCEvents; i += 1) {
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      void injectEvents();
      runPageHooks();
    }

    void bootstrap();

    const aiTimer = window.setTimeout(() => void hydrateStudentHomeAi(), 800);

    return () => {
      cancelled = true;
      window.clearTimeout(aiTimer);
      window.removeEventListener("dc-events-ready", onEventsReady);
      window.removeEventListener("dc-navigate", onSoftNavigate as EventListener);
      window.removeEventListener("dc-portal-invalidated", onPortalInvalidated);
    };
  }, [pathname, router]);

  return null;
}
