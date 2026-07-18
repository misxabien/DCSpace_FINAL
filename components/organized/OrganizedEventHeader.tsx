"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { formatEventDateParts } from "@/components/organized/OrganizedShell";
import { isEventSaved, toggleSavedEvent } from "@/lib/savedEvents";
import styles from "@/components/organized/OrganizedDetail.module.css";

export type OrganizedEventHeaderData = {
  id: string;
  title: string;
  date: string;
  venue: string;
  time: string;
  imageUrl: string;
};

export function OrganizedEventHeader({ event }: { event: OrganizedEventHeaderData }) {
  const parts = formatEventDateParts(event.date);
  const [saved, setSaved] = useState(false);

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
    setSaved(toggleSavedEvent(event.id));
  };

  return (
    <>
      <div className={styles.hero}>
        <img src={event.imageUrl} alt="" />
      </div>

      <div className={styles.head}>
        <div className={styles.date}>
          <span className={styles.dateMonth}>{parts.month}</span>
          <span className={styles.dateDay}>{parts.day}</span>
          <span className={styles.dateYear}>{parts.year}</span>
        </div>
        <div className={styles.info}>
          <h2>{event.title}</h2>
          <div className={styles.meta}>
            <span className={`${styles.metaRow} ${styles.metaVenue}`}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {event.venue}
            </span>
            <span className={`${styles.metaRow} ${styles.metaTime}`}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              {event.time}
            </span>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.iconBtn}${saved ? ` ${styles.iconBtnSaved}` : ""}`}
            aria-label={saved ? "Remove from saved events" : "Save event"}
            aria-pressed={saved}
            onClick={onBookmark}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Share event">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
