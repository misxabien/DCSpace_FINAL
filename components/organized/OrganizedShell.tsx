"use client";

import Link from "next/link";
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { isEventSaved, toggleSavedEvent } from "@/lib/savedEvents";
import { SavedEventsBridge } from "@/components/legacy/SavedEventsBridge";
import { useProfileHydration } from "@/components/legacy/useProfileHydration";
import { UserDisplayNameBridge } from "@/components/legacy/UserDisplayNameBridge";
import { resolveUserDisplayName } from "@/lib/user-api";
import styles from "@/components/organized/Organized.module.css";

export type OrganizedEvent = {
  id: string;
  title: string;
  date: string;
  venue: string;
  time: string;
  status: "postponed" | "cancelled" | "closed" | "open";
  submissions: number;
  /** Footer note under the card details */
  reviewNote?: string;
  /** Original Mongo status used by submissions filters */
  reviewStatus?: string;
  /** Event banner/poster for list cards */
  imageUrl?: string;
};

const STORAGE_KEY = "dc_organized_events_v6";

export function loadOrganizedEvents(): OrganizedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrganizedEvent[];
    return parsed
      .filter((event) => /^[a-f0-9]{24}$/i.test(String(event.id)))
      .map((event) => ({
        ...event,
        venue: event.venue || "Event Venue",
        time: event.time || "Event Time",
      }));
  } catch {
    return [];
  }
}

export function saveOrganizedEvents(events: OrganizedEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  window.dispatchEvent(new Event("dc-organized-changed"));
}

export function OrganizedShell({
  title = "Organize an Event!",
  backHref,
  children,
}: {
  title?: string;
  backHref?: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  useProfileHydration();

  useEffect(() => {
    const sync = () => setDisplayName(resolveUserDisplayName(user?.name));
    sync();
    window.addEventListener("dcspace-profile-updated", sync);
    return () => window.removeEventListener("dcspace-profile-updated", sync);
  }, [user?.name]);

  return (
    <>
      <main className={`main main--organized ${styles.page}`}>
        {backHref ? (
          <header className="detail-topbar">
            <div className="detail-title-row">
              <Link href={backHref} className="detail-back" aria-label="Go back">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
                  <circle cx="40" cy="40" r="40" fill="#FFFBF6" />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M48.3839 24.1161C48.872 24.6043 48.872 25.3957 48.3839 25.8839L34.2678 40L48.3839 54.1161C48.872 54.6043 48.872 55.3957 48.3839 55.8839C47.8957 56.372 47.1043 56.372 46.6161 55.8839L31.6161 40.8839C31.128 40.3957 31.128 39.6043 31.6161 39.1161L46.6161 24.1161C47.1043 23.628 47.8957 23.628 48.3839 24.1161Z"
                    fill="#448AFF"
                  />
                </svg>
              </Link>
              <h1>{title}</h1>
            </div>
            <div className="main__tools">
              <span className="main__user-name">{displayName}</span>
              <Link className={styles.toolBtn} href="/profile" aria-label="Profile">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" />
                </svg>
              </Link>
              <Link
                className={`${styles.toolBtn} tool-btn--notif`}
                href="/notifications"
                aria-label="Notifications"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              </Link>
              <button
                type="button"
                className={`${styles.toolBtn} ${styles.toolBtnHelp}`}
                aria-label="Help"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z" />
                </svg>
              </button>
            </div>
          </header>
        ) : (
          <div className={`main__top ${styles.top}`}>
            <h1 className={styles.greeting}>{title}</h1>
            <div className={styles.tools}>
              <span className={`main__user-name ${styles.userName}`}>{displayName}</span>
              <Link className={styles.toolBtn} href="/profile" aria-label="Profile">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" />
                </svg>
              </Link>
              <Link
                className={`${styles.toolBtn} tool-btn--notif`}
                href="/notifications"
                aria-label="Notifications"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              </Link>
              <button
                type="button"
                className={`${styles.toolBtn} ${styles.toolBtnHelp}`}
                aria-label="Help"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z" />
                </svg>
              </button>
            </div>
          </div>
        )}
        {children}
      </main>
      <SavedEventsBridge />
      <UserDisplayNameBridge />
    </>
  );
}

export function useOrganizedEvents() {
  const [events, setEvents] = useState<OrganizedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight: AbortController | null = null;

    const sync = async () => {
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;

      try {
        const { fetchOrganizedEventsLive } = await import("@/lib/organized/live");
        const live = await fetchOrganizedEventsLive(controller.signal);
        if (cancelled || controller.signal.aborted) return;
        setEvents(live);
        setError(null);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setEvents([]);
        setError(
          err instanceof Error ? err.message : "Failed to load organized events.",
        );
      } finally {
        if (inFlight === controller) inFlight = null;
      }
    };

    void sync();
    const timer = window.setInterval(() => void sync(), 30_000);
    window.addEventListener("dc-organized-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelled = true;
      inFlight?.abort();
      window.clearInterval(timer);
      window.removeEventListener("dc-organized-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { events, error };
}

export function formatEventDateParts(isoDate: string) {
  if (!isoDate) {
    return { month: "Month", day: "Date", year: "Year" };
  }
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { month: "Month", day: "Date", year: "Year" };
  }
  return {
    month: date.toLocaleString("en-US", { month: "short" }),
    day: String(date.getDate()).padStart(2, "0"),
    year: String(date.getFullYear()),
  };
}

export function OrganizedEventCard({
  event,
  showReviewNote = false,
  detailHref,
}: {
  event: OrganizedEvent;
  showReviewNote?: boolean;
  detailHref?: string;
}) {
  const router = useRouter();
  const parts = formatEventDateParts(event.date);
  const [saved, setSaved] = useState(false);

  const goToDetail = () => {
    if (detailHref) router.push(detailHref);
  };

  const onCardKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!detailHref) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToDetail();
    }
  };

  useEffect(() => {
    const sync = () => setSaved(isEventSaved(event.id));
    sync();
    window.addEventListener("dc-saved-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("dc-saved-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [event.id]);

  const onBookmark = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setSaved(toggleSavedEvent(event.id));
  };

  return (
    <article
      className={`event-card ${styles.listCard}${detailHref ? ` ${styles.listCardClickable}` : ""}`}
      aria-label={event.title}
      role={detailHref ? "link" : undefined}
      tabIndex={detailHref ? 0 : undefined}
      onClick={detailHref ? goToDetail : undefined}
      onKeyDown={onCardKeyDown}
    >
      <div className={`event-card__media ${styles.listCardMedia}`}>
        {event.imageUrl ? (
          <img
            className={styles.listCardImage}
            src={event.imageUrl}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={(e) => {
              e.currentTarget.remove();
            }}
          />
        ) : null}
        <button
          type="button"
          className={`event-card__bookmark ${styles.listBookmark}${saved ? " is-saved" : ""}`}
          aria-label={saved ? "Remove from saved events" : "Save event"}
          aria-pressed={saved}
          onClick={onBookmark}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </svg>
        </button>
      </div>
      <div className={`event-card__body ${styles.listCardBody}`}>
        <div className="event-card__date">
          <span className="event-card__date-month">{parts.month}</span>
          <span className="event-card__date-day">{parts.day}</span>
          <span className="event-card__date-year">{parts.year}</span>
        </div>
        <div className="event-card__info">
          <h3 className="event-card__name">{event.title}</h3>
          <p className="event-card__venue">{event.venue}</p>
          <p className="event-card__time">{event.time}</p>
          {showReviewNote && event.reviewNote ? (
            <p className={styles.reviewNote}>{event.reviewNote}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
