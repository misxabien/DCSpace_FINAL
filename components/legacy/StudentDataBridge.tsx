"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  bucketCategory,
  mapDbEventToCard,
  type LegacyCardEvent,
  type SanitizedEvent,
} from "@/lib/events/map-event";
import { setSavedEventIds, getSavedEventIds } from "@/lib/savedEvents";

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
    const res = await fetch("/api/user/attendance", { cache: "no-store", credentials: "include" });
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
    const seen = new Set<string>();
    for (const row of data.attendance || []) {
      const eventId = String(row.eventId || "");
      if (!eventId) continue;
      seen.add(eventId);
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

  if (pathname.startsWith("/events/details") && window.DCEvents.renderEventDetails) {
    window.DCEvents.renderEventDetails();
  }
  if (pathname.startsWith("/events/explore") && window.DCEvents.renderExploreDetails) {
    window.DCEvents.renderExploreDetails();
  }
  if (pathname.startsWith("/attendance/details") && window.DCEvents.renderAttendanceDetails) {
    window.DCEvents.renderAttendanceDetails();
  }
  if (pathname.startsWith("/events/submit") && window.DCEvents.renderSubmitPage) {
    window.DCEvents.renderSubmitPage();
  }

  if (pathname.startsWith("/saved")) {
    ["saved-grid"].forEach((id) => {
      if (!document.getElementById(id)) return;
      try {
        window.DCEvents?.fillSavedContainer?.(id, { detailContext: "explore" });
      } catch {
        /* ignore */
      }
    });
  }
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

function studentNotifBellTargets() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('a.tool-btn--notif[href="/notifications"]'),
  );
}

function setStudentNotifBadge(unreadCount: number) {
  const hasUnread = unreadCount > 0;
  for (const el of studentNotifBellTargets()) {
    el.classList.toggle("has-unread", hasUnread);
    let dot = el.querySelector<HTMLElement>(".notif-unread-dot");
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "notif-unread-dot";
      dot.setAttribute("aria-hidden", "true");
      el.appendChild(dot);
    }
    dot.hidden = !hasUnread;
    el.setAttribute(
      "aria-label",
      hasUnread
        ? unreadCount === 1
          ? "Notifications, 1 unread"
          : `Notifications, ${unreadCount} unread`
        : "Notifications",
    );
  }
}

async function updateStudentNotifBadge() {
  try {
    const res = await fetch("/api/user/notifications", {
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
    /* ignore */
  }
}

async function markStudentNotificationRead(id: string) {
  await fetch("/api/user/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id, read: true }),
  });
}

function wireStudentNotificationClicks() {
  if (document.documentElement.dataset.dcStudentNotifWired === "1") return;
  document.documentElement.dataset.dcStudentNotifWired = "1";
  document.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".notif-item");
    if (!btn) return;
    const id = btn.getAttribute("data-notif-id");
    const eventId = btn.getAttribute("data-event-id");
    if (id && btn.classList.contains("is-highlighted")) {
      btn.classList.remove("is-highlighted");
      void markStudentNotificationRead(id).then(() => void updateStudentNotifBadge());
    }
    if (eventId) {
      event.preventDefault();
      window.location.assign(`/events/explore?id=${encodeURIComponent(eventId)}`);
    }
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
        const [eventsRes, registrationsRes, invitationsRes] = await Promise.all([
          fetch("/api/events?limit=200", { cache: "no-store" }),
          fetch("/api/user/registrations", { cache: "no-store" }),
          fetch("/api/user/invitations", { cache: "no-store" }),
        ]);
        if (!eventsRes.ok || cancelled) return;

        const data = (await eventsRes.json()) as { events?: SanitizedEvent[] };
        const registrations = registrationsRes.ok
          ? ((await registrationsRes.json()) as {
              registrations?: Array<{ eventId?: string; status?: string }>;
            }).registrations || []
          : [];
        const invitations = invitationsRes.ok
          ? ((await invitationsRes.json()) as {
              invitations?: Array<{ eventId?: string; status?: string }>;
            }).invitations || []
          : [];

        const joined = new Map(
          registrations.map((row) => [String(row.eventId || ""), String(row.status || "joined")]),
        );
        const invited = new Set(
          invitations
            .filter((row) => String(row.status || "pending") !== "joined")
            .map((row) => String(row.eventId || "")),
        );

        let live: LegacyCardEvent[] = (data.events || [])
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
          live = live.filter((event) => registeredIds.has(String(event.id)));
          const buckets = await fetchAttendanceBuckets();
          live = applyAttendanceCategories(live, buckets);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          live = live.map((event) => {
            if (buckets.has(String(event.id))) return event;
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
          const one = await fetch(`/api/events/${encodeURIComponent(detailId)}`, {
            cache: "no-store",
          });
          if (one.ok) {
            const payload = (await one.json()) as { event?: SanitizedEvent };
            if (payload.event) {
              live = [
                mapDbEventToCard(payload.event, bucketCategory(payload.event)),
                ...live,
              ];
            }
          }
        }

        window.DCEvents.list = live;
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
        const res = await fetch("/api/user/saved-events", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { eventIds?: string[] };
        if (Array.isArray(data.eventIds)) {
          setSavedEventIds(data.eventIds);
          window.DCEvents?.fillSavedContainer?.("saved-grid", { detailContext: "explore" });
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
        await fetch("/api/user/saved-events", {
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

    const wireAttendanceTap = () => {
      if (!pathname.startsWith("/attendance")) return;
      const params = new URLSearchParams(window.location.search);
      const eventId = params.get("id");
      if (!eventId || pathname !== "/attendance/details") return;

      const footer = document.querySelector(".rfid-panel__footer");
      if (!footer) return;

      const ensureButton = (
        id: string,
        label: string,
        action: "in" | "out",
        active: boolean,
      ) => {
        let button = document.getElementById(id) as HTMLButtonElement | null;
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.id = id;
          button.className = `rfid-sort__btn${active ? " is-active" : ""}`;
          footer.prepend(button);
        }
        button.textContent = label;
        if (button.dataset.dcWired === "1") return;
        button.dataset.dcWired = "1";
        button.addEventListener("click", async () => {
          button!.disabled = true;
          try {
            const res = await fetch("/api/user/attendance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                eventId,
                eventName: document.getElementById("detail-name")?.textContent || "",
                action,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              window.alert(data.error || `Failed to tap ${action}.`);
              return;
            }
            if (data.duplicate) {
              window.alert(
                action === "in"
                  ? "You are already tapped in for this event."
                  : "Tap out was already recorded.",
              );
            } else if (data.certificate?.id) {
              window.alert(
                "Attendance completed. Your certificate is now available in Certificates.",
              );
            } else {
              window.alert(
                action === "in"
                  ? "Tap in recorded to your account."
                  : "Tap out recorded to your account.",
              );
            }
            try {
              window.sessionStorage.setItem("dc_attendance_bump", String(Date.now()));
            } catch {
              /* ignore */
            }
            void injectAttendanceRfid();
            void injectEvents();
          } catch {
            window.alert(`Failed to tap ${action}.`);
          } finally {
            button!.disabled = false;
          }
        });
      };

      ensureButton("dc-tap-in-btn", "Tap In", "in", true);
      ensureButton("dc-tap-out-btn", "Tap Out", "out", false);

      let note = document.getElementById("dc-attendance-rfid-note");
      if (!note) {
        note = document.createElement("p");
        note.id = "dc-attendance-rfid-note";
        note.style.cssText = "margin:0 0 10px;font-size:13px;color:#64748b;line-height:1.4;";
        footer.prepend(note);
      }
      note.textContent =
        "RFID tap in/out at the venue is saved to MongoDB instantly. This page refreshes your records in real time.";
    };

    const injectAttendanceRfid = async () => {
      if (pathname !== "/attendance/details" || !window.DCEvents) return;
      const eventId = new URLSearchParams(window.location.search).get("id");
      if (!eventId) return;
      try {
        const res = await fetch(
          `/api/user/attendance?eventId=${encodeURIComponent(eventId)}`,
          {
            cache: "no-store",
            credentials: "include",
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          attendance?: Array<{
            action?: string;
            createdAt?: string;
            scannedAt?: string;
            attendanceMinutes?: number;
            qualifiedForCertificate?: boolean;
          }>;
          sessions?: Array<{
            tapInAt?: string;
            tapOutAt?: string;
            attendanceMinutes?: number;
            qualifiedForCertificate?: boolean;
            open?: boolean;
          }>;
        };

        const sessions = data.sessions || [];
        const rows = [...(data.attendance || [])].reverse();
        let logs: Array<{ tapIn: string; tapOut: string }> = [];
        let openIn = "";
        let lastMinutes = 0;
        let qualified = false;

        if (sessions.length) {
          logs = sessions.map((session) => ({
            tapIn: session.tapInAt ? formatClock(session.tapInAt) : "—",
            tapOut: session.tapOutAt ? formatClock(session.tapOutAt) : "—",
          }));
          const open = sessions.find((session) => session.open);
          openIn = open?.tapInAt || "";
          lastMinutes = sessions.find((session) => session.attendanceMinutes)?.attendanceMinutes || 0;
          qualified = sessions.some((session) => session.qualifiedForCertificate);
        } else {
          for (const row of rows) {
            const stamp = String(row.scannedAt || row.createdAt || "");
            if (row.action === "in") {
              if (openIn) logs.push({ tapIn: formatClock(openIn), tapOut: "—" });
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
          if (openIn) logs.push({ tapIn: formatClock(openIn), tapOut: "—" });
        }
        if (!logs.length) logs.push({ tapIn: "—", tapOut: "—" });

        const statusEl = document.getElementById("dc-attendance-status");
        if (!statusEl) {
          const host =
            document.querySelector(".rfid-panel__header") ||
            document.querySelector(".rfid-panel");
          if (host) {
            const banner = document.createElement("p");
            banner.id = "dc-attendance-status";
            banner.style.cssText =
              "margin:0 0 12px;padding:10px 14px;border-radius:10px;font-size:13px;line-height:1.4;";
            host.prepend(banner);
          }
        }
        const banner = document.getElementById("dc-attendance-status");
        if (banner) {
          if (openIn) {
            banner.style.background = "#ecfdf5";
            banner.style.color = "#047857";
            banner.textContent = `You are currently tapped in (since ${formatClock(openIn)}). Tap out when you leave.`;
          } else if (qualified) {
            banner.style.background = "#eff6ff";
            banner.style.color = "#1d4ed8";
            banner.textContent =
              "Attendance completed for this event. Check Certificates if you qualified.";
          } else if (rows.length > 0 || sessions.length > 0) {
            banner.style.background = "#f8fafc";
            banner.style.color = "#475569";
            banner.textContent = "Your tap records are synced from MongoDB in real time.";
          } else {
            banner.style.background = "#fffbeb";
            banner.style.color = "#b45309";
            banner.textContent =
              "No attendance yet. Tap in at the venue with your RFID tag (or use Tap In below).";
          }
        }

        const event = window.DCEvents.getEventById?.(eventId) as
          | { attendanceRequired?: string; gracePeriod?: string; name?: string }
          | undefined;
        const detailName = document.getElementById("detail-name");
        if (detailName && event?.name) detailName.textContent = event.name;
        const required =
          Number(String(event?.attendanceRequired || "30").replace(/\D/g, "")) || 30;
        const progress = qualified
          ? 100
          : Math.min(100, Math.round((lastMinutes / required) * 100));

        window.DCEvents.attendanceRfid = {
          ...(window.DCEvents.attendanceRfid || {}),
          [eventId]: {
            graceRemaining: openIn ? event?.gracePeriod || "15 minutes" : "Complete",
            progress,
            logs: logs.slice(0, 12),
            page: { current: logs.some((row) => row.tapIn !== "—") ? 1 : 0, total: 1 },
          },
        };
        window.DCEvents.renderAttendanceDetails?.();
      } catch {
        /* keep static panel */
      }
    };

    const injectFeedbackList = async () => {
      if (!pathname.startsWith("/feedback")) return;
      try {
        const res = await fetch("/api/user/feedback?mine=1", { cache: "no-store" });
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
        const res = await fetch("/api/user/certificates", { cache: "no-store" });
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
        void injectEvents();
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
      wireAttendanceTap();
      void injectAttendanceRfid();
      void injectFeedbackList();
      void injectCertificates();
      void injectNotifications();
      void updateStudentNotifBadge();
    };

    const t1 = window.setTimeout(run, 80);
    const t2 = window.setTimeout(run, 400);
    const t3 = window.setTimeout(run, 900);
    // Attendance details: poll Mongo tap logs near real-time.
    const pollMs = pathname.startsWith("/attendance/details")
      ? 1500
      : pathname.startsWith("/attendance")
        ? 3000
        : 10000;
    const poll = window.setInterval(run, pollMs);
    const notifBadgePoll = window.setInterval(() => void updateStudentNotifBadge(), 4000);
    const aiTimer = window.setTimeout(() => void hydrateStudentHomeAi(), 700);

    const onFocusRefresh = () => {
      if (pathname.startsWith("/attendance")) {
        void injectAttendanceRfid();
        void injectEvents();
      }
    };
    window.addEventListener("focus", onFocusRefresh);
    document.addEventListener("visibilitychange", onFocusRefresh);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(aiTimer);
      window.clearInterval(poll);
      window.clearInterval(notifBadgePoll);
      window.removeEventListener("dc-saved-changed", onSavedChanged);
      window.removeEventListener("dc-events-ready", onEventsReady);
      window.removeEventListener("dc-join-event", onJoinEvent as EventListener);
      window.removeEventListener("dc-submit-event", onSubmitEvent as EventListener);
      window.removeEventListener("focus", onFocusRefresh);
      document.removeEventListener("visibilitychange", onFocusRefresh);
    };
  }, [pathname]);

  return null;
}
