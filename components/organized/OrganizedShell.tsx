"use client";

import Link from "next/link";
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/components/auth/AuthProvider";
import { isEventSaved, toggleSavedEvent } from "@/lib/savedEvents";
import styles from "@/components/organized/Organized.module.css";

export type OrganizedEvent = {
  id: string;
  title: string;
  date: string;
  venue: string;
  time: string;
  status: "draft" | "open" | "closed";
  submissions: number;
  /** Footer note under the card details */
  reviewNote?: string;
};

const STORAGE_KEY = "dc_organized_events_v6";

export function loadOrganizedEvents(): OrganizedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEvents();
    const parsed = JSON.parse(raw) as OrganizedEvent[];
    return parsed.map((event) => ({
      ...event,
      venue: event.venue || "Event Venue",
      time: event.time || "Event Time",
    }));
  } catch {
    return defaultEvents();
  }
}

export function saveOrganizedEvents(events: OrganizedEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  window.dispatchEvent(new Event("dc-organized-changed"));
}

function defaultEvents(): OrganizedEvent[] {
  return [
    {
      id: "17",
      title: "Invited Gala Night",
      date: "2026-07-29",
      venue: "Hotel Ballroom",
      time: "7:00 PM - 10:00 PM",
      status: "open",
      submissions: 12,
      reviewNote: "Admin has requested changes",
    },
    {
      id: "9",
      title: "AI Innovation Summit",
      date: "2026-08-05",
      venue: "Tech Hub",
      time: "9:00 AM - 5:00 PM",
      status: "open",
      submissions: 8,
      reviewNote: "Admin has requested changes",
    },
    {
      id: "12",
      title: "Startup Pitch Night",
      date: "2026-08-02",
      venue: "Auditorium B",
      time: "6:00 PM - 9:00 PM",
      status: "draft",
      submissions: 0,
    },
    {
      id: "15",
      title: "Charity Fundraiser",
      date: "2026-08-16",
      venue: "Campus Grounds",
      time: "11:00 AM - 4:00 PM",
      status: "draft",
      submissions: 0,
    },
    {
      id: "2",
      title: "Leadership Workshop",
      date: "2026-08-15",
      venue: "Room 204",
      time: "1:00 PM - 4:00 PM",
      status: "closed",
      submissions: 5,
      reviewNote: "Rejected",
    },
    {
      id: "8",
      title: "Math Olympiad Finals",
      date: "2026-08-18",
      venue: "Room 105",
      time: "1:00 PM - 3:00 PM",
      status: "closed",
      submissions: 3,
      reviewNote: "Rejected",
    },
  ];
}

export function OrganizedShell({
  title = "Organize an Event!",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  return (
    <AppShell>
      <Sidebar />
      <main className={`main ${styles.page}`}>
        <div className={styles.top}>
          <h1 className={styles.greeting}>{title}</h1>
          <div className={styles.tools}>
            <span className={`main__user-name ${styles.userName}`}>
              {user?.name || "Your Name"}
            </span>
            <Link className={styles.toolBtn} href="/profile" aria-label="Profile">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" />
              </svg>
            </Link>
            <Link className={styles.toolBtn} href="/notifications" aria-label="Notifications">
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
        {children}
      </main>
    </AppShell>
  );
}

export function useOrganizedEvents() {
  const [events, setEvents] = useState<OrganizedEvent[]>([]);

  useEffect(() => {
    const sync = () => setEvents(loadOrganizedEvents());
    sync();
    window.addEventListener("dc-organized-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("dc-organized-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return events;
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
