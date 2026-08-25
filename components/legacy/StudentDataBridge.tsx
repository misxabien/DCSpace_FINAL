"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  bucketCategory,
  mapDbEventToCard,
  resolveEventImageUrl,
  type LegacyCardEvent,
  type SanitizedEvent,
} from "@/lib/events/map-event";
import { setSavedEventIds, getSavedEventIds } from "@/lib/savedEvents";
import { fetchPortalData, readCachedPortalData, invalidatePortalCache } from "@/lib/portal-data-client";
import { authFetch } from "@/lib/user-api";

declare global {
  interface Window {
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
      renderEventDetails?: () => void;
      renderExploreDetails?: () => void;
      renderAttendanceDetails?: () => void;
      renderSubmitPage?: () => void;
      bindDetailBack?: (fallbackHref?: string) => void;
      wireDetailActions?: (eventId: string) => void;
      wireEventGridSearch?: () => void;
    };
    DCFeedback?: {
      FEEDBACK_ITEMS: unknown[];
      getFeedbackById?: (id: string | number) => unknown;
      renderFeedbackDetails?: () => void;
    };
    DCCertificates?: {
      list: unknown[];
      getCertificatesByCategory?: (category: string, limit?: number) => unknown[];
      fillCertificateContainer?: (id: string, category: string, limit?: number) => void;
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
    const res = await authFetch("/api/user/attendance", { cache: "no-store" });
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

function joinedTagForEvent(event: LegacyCardEvent) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(`${event.date}T12:00:00`);
  if (Number.isNaN(day.getTime())) return "joined-upcoming";
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return "joined-today";
  if (day.getTime() > today.getTime()) return "joined-upcoming";
  return "joined-past";
}

function fallbackAttendanceCard(
  eventId: string,
  title: string,
  category: string,
): LegacyCardEvent {
  return {
    id: eventId,
    name: title || "Event",
    venue: "—",
    time: "TBA",
    date: new Date().toISOString().slice(0, 10),
    category,
    status: "joined",
    venueType: "",
    eventType: "",
    organization: "",
    course: "",
    department: "",
    attendanceRequired: "",
    gracePeriod: "",
    requiresFiles: false,
    requiredFiles: [],
    filesApproved: true,
    description: "",
    announcements: "",
    imageUrl: "",
    speakers: [],
    programActivities: [],
    collaboratingDepartments: [],
    audienceSchools: [],
    organizerEmail: "",
    reviewNote: "",
    dbStatus: "completed",
    attachmentFiles: [],
  };
}

function titleForMissingEvent(
  eventId: string,
  registrations: Array<{ eventId?: string; eventTitle?: string }>,
  portalAttendance: Array<{ eventId?: string; eventTitle?: string }>,
) {
  const fromReg = registrations.find((row) => String(row.eventId || "") === eventId);
  if (fromReg?.eventTitle) return String(fromReg.eventTitle);
  const fromAtt = portalAttendance.find((row) => String(row.eventId || "") === eventId);
  if (fromAtt?.eventTitle) return String(fromAtt.eventTitle);
  return "Event";
}

/** Load full Mongo event fields (description, poster, requirements) for detail pages. */
async function ensureFullEventInList(eventId: string): Promise<LegacyCardEvent | null> {
  if (!window.DCEvents || !eventId) return null;
  try {
    const res = await authFetch(`/api/events/${encodeURIComponent(eventId)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const payload = (await res.json()) as { event?: SanitizedEvent };
      if (payload.event) {
        const card = mapDbEventToCard(payload.event, bucketCategory(payload.event));
        const list = Array.isArray(window.DCEvents.list)
          ? ([...window.DCEvents.list] as LegacyCardEvent[])
          : [];
        const idx = list.findIndex((item) => String(item.id) === eventId);
        if (idx >= 0) list[idx] = { ...list[idx], ...card };
        else list.unshift(card);
        window.DCEvents.list = list;
        return card;
      }
    }
  } catch {
    /* fall back to portal card */
  }
  return (window.DCEvents.getEventById?.(eventId) as LegacyCardEvent | undefined) || null;
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

  const detailId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id")
      : null;

  if (pathname.startsWith("/events/details") && window.DCEvents.renderEventDetails) {
    window.DCEvents.renderEventDetails();
    window.DCEvents.bindDetailBack?.("/home");
    if (detailId) window.DCEvents.wireDetailActions?.(detailId);
  }
  if (pathname.startsWith("/events/explore") && window.DCEvents.renderExploreDetails) {
    window.DCEvents.renderExploreDetails();
    window.DCEvents.bindDetailBack?.("/events");
    if (detailId) window.DCEvents.wireDetailActions?.(detailId);
  }
  if (pathname.startsWith("/attendance/details") && window.DCEvents.renderAttendanceDetails) {
    window.DCEvents.renderAttendanceDetails();
  }
  if (pathname.startsWith("/attendance")) {
    window.DCEvents.bindDetailBack?.("/attendance");
    window.DCEvents.wireEventGridSearch?.();
  }
  if (pathname.startsWith("/events/submit") && window.DCEvents.renderSubmitPage) {
    window.DCEvents.renderSubmitPage();
    window.DCEvents.bindDetailBack?.("/events");
  }

  if (pathname.startsWith("/saved")) {
    const savedTargets: Array<{ id: string; timing: string }> = [];
    if (document.getElementById("saved-today-grid")) {
      savedTargets.push({ id: "saved-today-grid", timing: "today" });
    }
    if (document.getElementById("saved-upcoming-grid")) {
      savedTargets.push({ id: "saved-upcoming-grid", timing: "upcoming" });
    }
    if (document.getElementById("saved-past-grid")) {
      savedTargets.push({ id: "saved-past-grid", timing: "past" });
    }
    if (document.getElementById("saved-grid")) {
      const timing = pathname.includes("/today")
        ? "today"
        : pathname.includes("/upcoming")
          ? "upcoming"
          : pathname.includes("/past")
            ? "past"
            : "upcoming";
      savedTargets.push({ id: "saved-grid", timing });
    }
    savedTargets.forEach(({ id, timing }) => {
      try {
        window.DCEvents?.fillSavedContainer?.(id, {
          timing,
          detailContext: "explore",
          limit: 50,
        });
      } catch {
        /* ignore */
      }
    });
  }
}

function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAttendanceStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildTapLogsFromAttendance(
  attendance: Array<{
    action?: string;
    scannedAt?: string;
    createdAt?: string;
  }>,
  sessions: Array<{
    tapInAt?: string;
    tapOutAt?: string;
    open?: boolean;
  }>,
) {
  if (sessions.length) {
    return sessions
      .map((session) => ({
        tapIn: session.tapInAt ? formatAttendanceStamp(session.tapInAt) : "—",
        tapOut: session.tapOutAt ? formatAttendanceStamp(session.tapOutAt) : "—",
      }))
      .filter((row) => row.tapIn !== "—" || row.tapOut !== "—");
  }

  const chronological = [...attendance].sort(
    (a, b) =>
      new Date(String(a.scannedAt || a.createdAt || "")).getTime() -
      new Date(String(b.scannedAt || b.createdAt || "")).getTime(),
  );

  const logs: Array<{ tapIn: string; tapOut: string }> = [];
  let openIn = "";

  for (const row of chronological) {
    const stamp = String(row.scannedAt || row.createdAt || "");
    if (String(row.action || "in") === "in") {
      if (openIn) {
        logs.push({ tapIn: formatAttendanceStamp(openIn), tapOut: "—" });
      }
      openIn = stamp;
    } else if (openIn) {
      logs.push({
        tapIn: formatAttendanceStamp(openIn),
        tapOut: formatAttendanceStamp(stamp),
      });
      openIn = "";
    } else {
      logs.push({ tapIn: "—", tapOut: formatAttendanceStamp(stamp) });
    }
  }
  if (openIn) {
    logs.push({ tapIn: formatAttendanceStamp(openIn), tapOut: "—" });
  }

  return logs;
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

function studentNotifBellTargets() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        'a.tool-btn--notif[href="/notifications"]',
        'a.tool-btn[href="/notifications"]',
        'a[href="/notifications"][aria-label*="Notification" i]',
      ].join(", "),
    ),
  );
}

function setStudentNotifBadge(unreadCount: number) {
  const hasUnread = unreadCount > 0;
  for (const el of studentNotifBellTargets()) {
    el.classList.add("tool-btn--notif");
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }
    el.classList.toggle("has-unread", hasUnread);
    let dot = el.querySelector<HTMLElement>(".notif-unread-dot");
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "notif-unread-dot";
      dot.setAttribute("aria-hidden", "true");
      el.appendChild(dot);
    }
    dot.hidden = !hasUnread;
    if (hasUnread) {
      el.setAttribute("data-unread-count", String(unreadCount));
      el.setAttribute(
        "aria-label",
        unreadCount === 1
          ? "Notifications, 1 unread"
          : `Notifications, ${unreadCount} unread`,
      );
    } else {
      el.removeAttribute("data-unread-count");
      el.setAttribute("aria-label", "Notifications");
    }
  }
}

async function updateStudentNotifBadge() {
  try {
    const res = await fetch("/api/user/notifications?light=1", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      notifications?: Array<{ read: boolean }>;
    };
    const unread = (data.notifications || []).filter((item) => !item.read).length;
    setStudentNotifBadge(unread);
  } catch {
    /* ignore aborted/network errors (Safari "Load failed") */
  }
}

async function markStudentNotificationRead(id: string) {
  try {
    await fetch("/api/user/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      // keepalive so the write still finishes if we navigate away immediately
      keepalive: true,
      body: JSON.stringify({ id, read: true }),
    });
  } catch {
    /* ignore */
  }
}

function markNotificationItemReadUi(btn: HTMLElement) {
  btn.classList.remove("is-highlighted");
  const tags = (btn.getAttribute("data-filter-tags") || "")
    .split(/\s+/)
    .filter((tag) => tag && tag !== "unread");
  if (!tags.includes("all")) tags.unshift("all");
  if (!tags.includes("recent")) tags.push("recent");
  btn.setAttribute("data-filter-tags", tags.join(" "));
}

function wireStudentNotificationClicks() {
  if (document.documentElement.dataset.dcStudentNotifWired === "1") return;
  document.documentElement.dataset.dcStudentNotifWired = "1";
  document.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".notif-item");
    if (!btn) return;
    const id = btn.getAttribute("data-notif-id");
    const eventId = btn.getAttribute("data-event-id");
    const wasUnread =
      btn.classList.contains("is-highlighted") ||
      (btn.getAttribute("data-filter-tags") || "").includes("unread");

    // Always stop legacy handlers; we own navigation after mark-read.
    event.preventDefault();
    event.stopPropagation();

    const finish = () => {
      void updateStudentNotifBadge();
      window.dispatchEvent(new CustomEvent("dc-notifications-rendered"));
      if (eventId) {
        window.location.assign(`/events/explore?id=${encodeURIComponent(eventId)}`);
      }
    };

    if (id && wasUnread) {
      markNotificationItemReadUi(btn);
      void markStudentNotificationRead(id).finally(finish);
      return;
    }

    finish();
  });
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

  useEffect(() => {
    let cancelled = false;

    const injectEvents = async () => {
      if (!window.DCEvents) return;

      try {
        let events: SanitizedEvent[] = [];
        let registrations: Array<{ eventId?: string; status?: string; eventTitle?: string }> = [];
        let invitations: Array<{ eventId?: string; status?: string }> = [];
        let portalAttendance: Array<{
          eventId?: string;
          action?: string;
          qualifiedForCertificate?: boolean;
          eventTitle?: string;
        }> = [];

        const forcePortal = pathname.startsWith("/attendance") || pathname === "/home";
        const portal = await fetchPortalData(forcePortal);
        if (portal?.events) {
          events = portal.events;
          registrations = portal.registrations;
          invitations = portal.invitations;
          portalAttendance = portal.attendance || [];
          if (portal.savedEventIds?.length) {
            setSavedEventIds(portal.savedEventIds);
          }
        } else {
          const cached = readCachedPortalData();
          if (cached?.events) {
            events = cached.events;
            registrations = cached.registrations;
            invitations = cached.invitations;
            portalAttendance = cached.attendance || [];
          } else {
            const [eventsRes, registrationsRes, invitationsRes] = await Promise.all([
              authFetch("/api/events?limit=200", { cache: "no-store" }),
              authFetch("/api/user/registrations", { cache: "no-store" }),
              authFetch("/api/user/invitations", { cache: "no-store" }),
            ]);
            if (!eventsRes.ok || cancelled) return;
            const data = (await eventsRes.json()) as { events?: SanitizedEvent[] };
            events = data.events || [];
            registrations = registrationsRes.ok
              ? ((await registrationsRes.json()) as {
                  registrations?: Array<{ eventId?: string; status?: string }>;
                }).registrations || []
              : [];
            invitations = invitationsRes.ok
              ? ((await invitationsRes.json()) as {
                  invitations?: Array<{ eventId?: string; status?: string }>;
                }).invitations || []
              : [];
          }
        }

        if (cancelled) return;

        const joined = new Map(
          registrations.map((row) => [String(row.eventId || ""), String(row.status || "joined")]),
        );
        const invited = new Set(
          invitations
            .filter((row) => String(row.status || "pending") !== "joined")
            .map((row) => String(row.eventId || "")),
        );

        let live: LegacyCardEvent[] = events
          .filter((event) => ["approved", "live", "completed"].includes(event.status || ""))
          .map((event) => {
            const card = mapDbEventToCard(event, bucketCategory(event));
            const tags = [card.category];
            if (invited.has(card.id)) tags.push("invited");
            if (joined.has(card.id)) tags.push(joinedTagForEvent(card));
            const status = joined.get(card.id);
            return {
              ...card,
              tags,
              status: status === "pending" ? "pending" : status ? "joined" : card.status,
            };
          });

        if (pathname.startsWith("/attendance")) {
          const registeredIds = new Set(
            registrations
              .filter((row) => ["joined", "approved"].includes(String(row.status || "joined")))
              .map((row) => String(row.eventId || "")),
          );
          for (const row of portalAttendance) {
            if (row.eventId) registeredIds.add(String(row.eventId));
          }
          // Always include this account's attendance event ids from MongoDB.
          const liveBuckets =
            portalAttendance.length > 0
              ? (() => {
                  const buckets = new Map<
                    string,
                    "attendance-completed" | "attendance-incomplete" | "attendance-today"
                  >();
                  for (const row of portalAttendance) {
                    const eventId = String(row.eventId || "");
                    if (!eventId) continue;
                    if (row.qualifiedForCertificate || row.action === "out") {
                      buckets.set(eventId, "attendance-completed");
                    } else if (
                      row.action === "in" &&
                      buckets.get(eventId) !== "attendance-completed"
                    ) {
                      buckets.set(eventId, "attendance-incomplete");
                    }
                  }
                  return buckets;
                })()
              : await fetchAttendanceBuckets();

          for (const eventId of liveBuckets.keys()) registeredIds.add(eventId);

          live = live.filter((event) => registeredIds.has(String(event.id)));
          // Build cards for attendance/registration events missing from the browse list.
          const missingIds = [...registeredIds].filter(
            (id) => id && !live.some((event) => String(event.id) === id),
          );
          for (const missingId of missingIds.slice(0, 20)) {
            const bucket =
              liveBuckets.get(missingId) ||
              ("attendance-completed" as const);
            const fromPortal = events.find((event) => String(event.id) === missingId);
            if (fromPortal) {
              live.push(mapDbEventToCard(fromPortal, bucket));
            } else {
              live.push(
                fallbackAttendanceCard(
                  missingId,
                  titleForMissingEvent(missingId, registrations, portalAttendance),
                  bucket,
                ),
              );
            }
          }

          live = applyAttendanceCategories(live, liveBuckets);
          // Keep posters on attendance cards (same media strip as Events).
          live = live.map((event) => {
            if (event.imageUrl) return event;
            const source = events.find((row) => String(row.id) === String(event.id));
            if (!source) return event;
            const imageUrl = resolveEventImageUrl(source);
            return imageUrl ? { ...event, imageUrl } : event;
          });
          // Fallback cards / stale portal rows: resolve poster flags without downloading blobs.
          const needsPosterMeta = live
            .filter((event) => !event.imageUrl && event.id)
            .slice(0, 24);
          if (needsPosterMeta.length) {
            const resolved = await Promise.all(
              needsPosterMeta.map(async (event) => {
                try {
                  const res = await authFetch(
                    `/api/events/${encodeURIComponent(String(event.id))}?light=1`,
                    { cache: "no-store" },
                  );
                  if (!res.ok) return event;
                  const payload = (await res.json()) as { event?: SanitizedEvent };
                  if (!payload.event) return event;
                  const imageUrl = resolveEventImageUrl(payload.event);
                  const merged = mapDbEventToCard(
                    payload.event,
                    String(event.category || bucketCategory(payload.event)),
                  );
                  return {
                    ...merged,
                    category: event.category || merged.category,
                    imageUrl: imageUrl || merged.imageUrl || "",
                  };
                } catch {
                  return event;
                }
              }),
            );
            const byId = new Map(resolved.map((row) => [String(row.id), row]));
            live = live.map((event) => byId.get(String(event.id)) || event);
          }
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          live = live.map((event) => {
            if (liveBuckets.has(String(event.id))) return event;
            const day = new Date(`${event.date}T12:00:00`);
            if (Number.isNaN(day.getTime())) return event;
            day.setHours(0, 0, 0, 0);
            if (day.getTime() === today.getTime() && event.status === "live") {
              return { ...event, category: "attendance-today" };
            }
            return event;
          });
        }

        const params = new URLSearchParams(window.location.search);
        const detailId = params.get("id");
        if (detailId && !live.some((event) => String(event.id) === detailId)) {
          const existing = events.find((event) => String(event.id) === detailId);
          if (existing) {
            live = [mapDbEventToCard(existing, bucketCategory(existing)), ...live];
          } else {
            live = [
              fallbackAttendanceCard(
                detailId,
                titleForMissingEvent(detailId, registrations, portalAttendance),
                "attendance-completed",
              ),
              ...live,
            ];
          }
        }

        window.DCEvents.list = live;
        if (
          pathname.startsWith("/events/details") ||
          pathname.startsWith("/events/explore") ||
          pathname.startsWith("/events/submit") ||
          pathname.startsWith("/attendance/details")
        ) {
          const detailId = new URLSearchParams(window.location.search).get("id");
          if (detailId) {
            await ensureFullEventInList(detailId);
          }
        }
        if (pathname.startsWith("/attendance/details")) {
          window.DCEvents.renderAttendanceDetails?.();
        }
        if (pathname.startsWith("/events/details")) {
          window.DCEvents.renderEventDetails?.();
        }
        if (pathname.startsWith("/events/explore")) {
          window.DCEvents.renderExploreDetails?.();
        }
        if (pathname.startsWith("/events/submit")) {
          window.DCEvents.renderSubmitPage?.();
        }
        if (pathname.startsWith("/attendance") && !pathname.startsWith("/attendance/details")) {
          const grids = ["attendance-today-grid", "attendance-completed-grid", "attendance-incomplete-grid"];
          const hasAny = grids.some((id) => {
            const el = document.getElementById(id);
            return el && live.some((event) => {
              const cat = String(event.category || "");
              if (id === "attendance-today-grid") return cat === "attendance-today";
              if (id === "attendance-completed-grid") return cat === "attendance-completed";
              if (id === "attendance-incomplete-grid") return cat === "attendance-incomplete";
              return false;
            });
          });
          if (!hasAny && live.length === 0) {
            grids.forEach((id) => {
              const el = document.getElementById(id);
              if (!el) return;
              el.innerHTML =
                '<div style="padding:24px;text-align:center;color:#64748b;font-size:14px;line-height:1.5;">' +
                "No registered events yet. Join an event first, then return here to track your tap-in and tap-out." +
                "</div>";
            });
          }
        }
        refreshLegacyEventViews(pathname);
        window.dispatchEvent(new CustomEvent("dc-events-ready"));
      } catch {
        /* keep existing list */
      }
    };

    const syncSaved = async () => {
      try {
        const res = await authFetch("/api/user/saved-events", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { eventIds?: string[] };
        if (Array.isArray(data.eventIds)) {
          setSavedEventIds(data.eventIds);
          if (pathname.startsWith("/saved")) {
            refreshLegacyEventViews(pathname);
          } else {
            window.DCEvents?.fillSavedContainer?.("saved-grid", { detailContext: "explore" });
          }
        }
      } catch {
        /* local only */
      }
    };

    const hydrateStudentHomeAi = async () => {
      if (pathname !== "/home") return;
      const greeting =
        document.querySelector(".main__greeting") || document.querySelector(".joined-head");
      if (!greeting || greeting.parentElement?.querySelector("[data-dc-ai-home]")) return;

      try {
        const res = await fetch("/api/ai/student-home", { cache: "no-store" });
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

    const persistSaved = async () => {
      const ids = getSavedEventIds();
      try {
        await authFetch("/api/user/saved-events", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventIds: ids }),
        });
      } catch {
        /* ignore */
      }
    };

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

    const clearManualAttendanceTaps = () => {
      document.getElementById("dc-tap-in-btn")?.remove();
      document.getElementById("dc-tap-out-btn")?.remove();
      const note = document.getElementById("dc-attendance-rfid-note");
      if (note) {
        note.textContent =
          "Tap in and tap out are recorded at the venue by the admin live RFID scanner. This page refreshes your records in real time.";
      }
    };

    const injectAttendanceRfid = async () => {
      if (pathname !== "/attendance/details" || !window.DCEvents) return;
      const eventId = new URLSearchParams(window.location.search).get("id");
      if (!eventId) return;
      clearManualAttendanceTaps();
      document.getElementById("dc-attendance-history")?.remove();
      try {
        await ensureFullEventInList(eventId);

        const attendanceRes = await authFetch(
          `/api/user/attendance?eventId=${encodeURIComponent(eventId)}&source=live`,
          { cache: "no-store" },
        );

        const existingEvent = window.DCEvents.getEventById?.(eventId);

        if (!attendanceRes.ok) {
          if (!existingEvent) {
            const list = Array.isArray(window.DCEvents.list) ? [...window.DCEvents.list] : [];
            list.unshift(fallbackAttendanceCard(eventId, "Event", "attendance-completed"));
            window.DCEvents.list = list;
          }
          return;
        }
        const data = (await attendanceRes.json()) as {
          attendance?: Array<{
            action?: string;
            createdAt?: string;
            scannedAt?: string;
            attendanceMinutes?: number;
            qualifiedForCertificate?: boolean;
            source?: string;
            eventTitle?: string;
          }>;
          sessions?: Array<{
            tapInAt?: string;
            tapOutAt?: string;
            attendanceMinutes?: number;
            qualifiedForCertificate?: boolean;
            open?: boolean;
            eventTitle?: string;
          }>;
        };

        if (!window.DCEvents.getEventById?.(eventId)) {
          const title =
            String(data.sessions?.[0]?.eventTitle || "").trim() ||
            String(data.attendance?.[0]?.eventTitle || "").trim() ||
            "Event";
          const list = Array.isArray(window.DCEvents.list) ? [...window.DCEvents.list] : [];
          list.unshift(fallbackAttendanceCard(eventId, title, "attendance-completed"));
          window.DCEvents.list = list;
        }

        const sessions = data.sessions || [];
        const attendanceRows = data.attendance || [];
        const logs = buildTapLogsFromAttendance(attendanceRows, sessions);

        let openIn = "";
        let lastMinutes = 0;
        let qualified = false;

        const openSession = sessions.find((session) => session.open);
        if (openSession?.tapInAt) {
          openIn = openSession.tapInAt;
        } else if (sessions.length) {
          const last = sessions[0];
          if (last.tapInAt && !last.tapOutAt) openIn = last.tapInAt;
        }

        for (const session of sessions) {
          if (session.qualifiedForCertificate) qualified = true;
          if (Number(session.attendanceMinutes || 0) > 0) {
            lastMinutes = Number(session.attendanceMinutes);
          }
        }
        for (const row of attendanceRows) {
          if (row.qualifiedForCertificate) qualified = true;
          if (Number(row.attendanceMinutes || 0) > 0) {
            lastMinutes = Number(row.attendanceMinutes);
          }
        }

        const statusHost =
          document.querySelector(".rfid-panel__stats") ||
          document.querySelector(".rfid-panel");
        let banner = document.getElementById("dc-attendance-status");
        if (!banner && statusHost) {
          banner = document.createElement("p");
          banner.id = "dc-attendance-status";
          banner.style.cssText =
            "margin:0 0 12px;padding:10px 14px;border-radius:16px;font-size:13px;line-height:1.4;";
          statusHost.prepend(banner);
        }
        if (banner) {
          if (openIn) {
            banner.style.background = "#ecfdf5";
            banner.style.color = "#047857";
            banner.textContent = `You are currently tapped in (since ${formatAttendanceStamp(openIn)}). Tap out at the venue when you leave.`;
          } else if (qualified) {
            banner.style.background = "#eff6ff";
            banner.style.color = "#1d4ed8";
            banner.textContent =
              "Attendance completed for this event. Check Certificates if you qualified.";
          } else if (logs.length > 0) {
            banner.style.background = "#f8fafc";
            banner.style.color = "#475569";
            banner.textContent = `${logs.length} tap record${logs.length === 1 ? "" : "s"} from the venue RFID scanner.`;
          } else {
            banner.style.background = "#fffbeb";
            banner.style.color = "#b45309";
            banner.textContent =
              "No attendance yet. Tap in at the venue with your RFID tag — recorded by the live attendance scanner.";
          }
        }

        const event = window.DCEvents.getEventById?.(eventId) as
          | {
              attendanceRequired?: string;
              gracePeriod?: string;
              name?: string;
              venue?: string;
              time?: string;
              date?: string;
            }
          | undefined;

        const required =
          Number(String(event?.attendanceRequired || "30").replace(/\D/g, "")) || 30;
        const progress = qualified
          ? 100
          : Math.min(100, Math.round((lastMinutes / required) * 100));

        window.DCEvents.attendanceRfid = {
          ...(window.DCEvents.attendanceRfid || {}),
          [eventId]: {
            graceRemaining: openIn
              ? `Tap in active · grace ${event?.gracePeriod || "15 minutes"}`
              : qualified
                ? "Complete"
                : lastMinutes > 0
                  ? `${lastMinutes} of ${required} min`
                  : event?.gracePeriod || "—",
            progress,
            logs,
            qualified,
            openTapIn: Boolean(openIn),
            attendanceMinutes: lastMinutes,
            requiredMinutes: required,
            page: {
              current: logs.length ? 1 : 0,
              total: Math.max(1, Math.ceil(logs.length / 10)),
            },
          },
        };

        window.DCEvents.renderAttendanceDetails?.();
        window.DCEvents.wireDetailActions?.(eventId);
      } catch {
        /* keep static panel */
      }
    };

    const injectFeedbackList = async () => {
      if (!pathname.startsWith("/feedback")) return;
      try {
        const res = await authFetch("/api/user/feedback?mine=1", { cache: "no-store" });
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
          const lis = Array.from(list.querySelectorAll<HTMLLIElement>("li"));
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

        if (pathname.startsWith("/feedback/details")) {
          window.DCFeedback?.renderFeedbackDetails?.();
        }
      } catch {
        /* keep mock */
      }
    };

    const injectCertificates = async () => {
      if (!pathname.startsWith("/certificates")) return;
      try {
        const res = await authFetch("/api/user/certificates", { cache: "no-store" });
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
        const certTargets: Array<{ id: string; category: string }> = [
          { id: "cert-today-grid", category: "cert-today" },
          { id: "cert-weekend-grid", category: "cert-weekend" },
          { id: "cert-month-grid", category: "cert-month" },
        ];
        if (pathname.startsWith("/certificates/weekend")) {
          certTargets.push({ id: "cert-grid", category: "cert-weekend" });
        } else if (pathname.startsWith("/certificates/today")) {
          certTargets.push({ id: "cert-grid", category: "cert-today" });
        } else {
          certTargets.push({ id: "cert-grid", category: "cert-month" });
        }
        certTargets.forEach(({ id, category }) => {
          if (!document.getElementById(id)) return;
          try {
            window.DCCertificates?.fillCertificateContainer?.(id, category, 12);
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* keep mock */
      }
    };

    const injectNotifications = async () => {
      wireStudentNotificationClicks();
      try {
        const res = await fetch("/api/user/notifications", {
          cache: "no-store",
          credentials: "include",
        });
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
        setStudentNotifBadge(items.filter((item) => !item.read).length);
        if (pathname !== "/notifications") return;
        const todayList = document.getElementById("notif-today-list");
        const yesterdayList =
          document.getElementById("notif-yesterday-list") ||
          document.querySelector('[data-group="yesterday"] .notif-list');
        if (!todayList) return;

        const escapeHtml = (value: string) =>
          String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

        const renderList = (host: Element, rows: typeof items) => {
          if (!rows.length) {
            host.innerHTML = "";
            return;
          }
          host.innerHTML = rows
            .map((item) => {
              const highlighted = item.read ? "" : " is-highlighted";
              const tags = item.read ? "all recent" : "all recent unread";
              const search = escapeHtml(`${item.title} ${item.body}`.toLowerCase());
              return `<li>
                <button type="button" class="notif-item${highlighted}" data-notif-id="${escapeHtml(item.id)}" data-event-id="${escapeHtml(item.eventId || "")}" data-filter-tags="${tags}" data-search="${search}">
                  <span class="${notifIconClass(item.type)}" aria-hidden="true">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  </span>
                  <span class="notif-item__body">
                    <span class="notif-item__title">${escapeHtml(item.title)}</span>
                    <span class="notif-item__desc">${escapeHtml(item.body)}</span>
                  </span>
                  <span class="notif-item__time">${escapeHtml(timeAgo(item.createdAt))}</span>
                </button>
              </li>`;
            })
            .join("");
        };

        const todayRows = items.filter((item) => isSameDay(item.createdAt));
        const earlierRows = items.filter((item) => !isSameDay(item.createdAt));
        renderList(todayList, todayRows);
        if (yesterdayList) {
          renderList(yesterdayList, earlierRows);
        }

        const todayGroup = todayList.closest(".notif-group") as HTMLElement | null;
        const yesterdayGroup = yesterdayList?.closest(".notif-group") as HTMLElement | null;
        if (todayGroup) todayGroup.hidden = todayRows.length === 0;
        if (yesterdayGroup) yesterdayGroup.hidden = earlierRows.length === 0;

        const empty = document.getElementById("notif-empty");
        if (empty) {
          empty.hidden = items.length > 0;
          empty.textContent =
            items.length > 0
              ? "No notifications match your search."
              : "No notifications yet.";
        }

        // Re-bind legacy tab/search filters against the live DOM nodes.
        window.dispatchEvent(new CustomEvent("dc-notifications-rendered"));
      } catch {
        /* keep static markup */
      }
    };

    const joinEvent = async (eventId: string, eventTitle: string, files?: unknown[]) => {
      const res = await fetch("/api/user/registrations", {
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
      return data;
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
        await joinEvent(eventId, String(detail.eventTitle || ""));
        if (actionBtn) {
          actionBtn.textContent = "Registration Successful";
          actionBtn.className = "detail-action detail-action--joined";
        }
        invalidatePortalCache();
        void injectEvents();
        window.dispatchEvent(new CustomEvent("dcspace-profile-updated"));
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
        if (submitBtn) {
          submitBtn.textContent = "Registration Pending";
          submitBtn.disabled = true;
          submitBtn.className = "detail-action detail-action--pending";
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Failed to submit registration.");
      }
    };

    const onSavedChanged = () => {
      void persistSaved();
    };

    const onEventsReady = () => {
      refreshLegacyEventViews(pathname);
    };

    window.addEventListener("dc-saved-changed", onSavedChanged);
    window.addEventListener("dc-events-ready", onEventsReady);
    window.addEventListener("dc-join-event", onJoinEvent as EventListener);
    window.addEventListener("dc-submit-event", onSubmitEvent as EventListener);

    const run = () => {
      void injectEvents();
      void syncSaved();
      wireFeedbackForm();
      clearManualAttendanceTaps();
      void injectAttendanceRfid();
      void injectFeedbackList();
      void injectCertificates();
      if (pathname === "/notifications") {
        void injectNotifications();
      }
    };

    const t1 = window.setTimeout(run, 80);
    const t2 = window.setTimeout(run, 400);
    const t3 = window.setTimeout(run, 900);
    // Attendance details: poll Mongo tap logs near real-time.
    const pollMs = pathname.startsWith("/attendance/details")
      ? 1500
      : pathname.startsWith("/attendance")
        ? 3000
        : pathname === "/notifications"
          ? 10_000
          : pathname === "/home" || pathname.startsWith("/events")
            ? 5000
            : 8000;
    const poll = window.setInterval(run, pollMs);
    // Badge polling is owned by UserNotifBadgeBridge — avoid duplicate fetches.
    const aiTimer = window.setTimeout(() => void hydrateStudentHomeAi(), 700);

    const onFocusRefresh = () => {
      void injectEvents();
      if (pathname.startsWith("/attendance")) {
        void injectAttendanceRfid();
      }
      if (pathname.startsWith("/feedback")) void injectFeedbackList();
      if (pathname.startsWith("/certificates")) void injectCertificates();
      if (pathname === "/notifications") void injectNotifications();
    };
    const onPortalInvalidated = () => {
      void fetchPortalData(true).then(() => run());
    };
    window.addEventListener("focus", onFocusRefresh);
    document.addEventListener("visibilitychange", onFocusRefresh);
    window.addEventListener("dc-portal-invalidated", onPortalInvalidated);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(aiTimer);
      window.clearInterval(poll);
      window.removeEventListener("dc-saved-changed", onSavedChanged);
      window.removeEventListener("dc-events-ready", onEventsReady);
      window.removeEventListener("dc-join-event", onJoinEvent as EventListener);
      window.removeEventListener("dc-submit-event", onSubmitEvent as EventListener);
      window.removeEventListener("focus", onFocusRefresh);
      document.removeEventListener("visibilitychange", onFocusRefresh);
      window.removeEventListener("dc-portal-invalidated", onPortalInvalidated);
    };
  }, [pathname]);

  return null;
}
