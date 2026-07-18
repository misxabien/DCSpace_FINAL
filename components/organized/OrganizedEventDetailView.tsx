"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { EventGallerySection } from "@/components/organized/EventGallerySection";
import { InvitationListSection } from "@/components/organized/InvitationListSection";
import { OrganizedEventHeader } from "@/components/organized/OrganizedEventHeader";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import {
  addEventGalleryPhoto,
  getEventGalleryPhotos,
  type EventGalleryPhoto,
} from "@/lib/organizedEventGallery";
import {
  getInvitationList,
  type InvitationListEntry,
} from "@/lib/organizedInvitations";
import styles from "@/components/organized/OrganizedDetail.module.css";

export function OrganizedEventDetailView({ event }: { event: OrganizedEventDetail }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [invitations, setInvitations] = useState<InvitationListEntry[]>([]);
  const [photos, setPhotos] = useState<EventGalleryPhoto[]>([]);

  const loadDetailData = () => {
    setInvitations(getInvitationList(event.id));
    setPhotos(getEventGalleryPhotos(event.id));
  };

  useEffect(() => {
    loadDetailData();
  }, [event.id]);

  useEffect(() => {
    const onChange = () => loadDetailData();
    window.addEventListener("dc-invites-changed", onChange);
    window.addEventListener("dc-gallery-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("dc-invites-changed", onChange);
      window.removeEventListener("dc-gallery-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [event.id]);

  const onPhotoButtonClick = () => {
    fileInputRef.current?.click();
  };

  const onPhotoSelected = (eventChange: ChangeEvent<HTMLInputElement>) => {
    const files = eventChange.target.files;
    if (!files?.length) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        addEventGalleryPhoto(event.id, reader.result);
        setPhotos(getEventGalleryPhotos(event.id));
      };
      reader.readAsDataURL(file);
    });

    eventChange.target.value = "";
  };

  return (
    <article className={styles.page}>
      <OrganizedEventHeader event={event} />

      <hr className={styles.divider} />

      <section className={styles.section}>
        <h3>Event Announcements</h3>
        {event.announcements.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
      </section>

      <section className={styles.section}>
        <h3>Event Description</h3>
        {event.description.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
        <div className={styles.types}>
          <div className={styles.listItem}>
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
              <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
            </svg>
            <span>Venue Type ({event.venueType})</span>
          </div>
          <div className={styles.listItem}>
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span>Event Type ({event.eventType})</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3>Hosted By</h3>
        <div className={styles.list}>
          <div className={styles.listItem}>
            <svg viewBox="0 0 24 24" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            <span>{event.organization}</span>
          </div>
          <div className={styles.listItem}>
            <svg viewBox="0 0 24 24" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            <span>{event.course}</span>
          </div>
          <div className={styles.listItem}>
            <svg viewBox="0 0 24 24" strokeWidth="2">
              <path d="M3 21h18M6 21V7h12v14" />
              <path d="M9 21v-4h6v4" />
            </svg>
            <span>{event.department}</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3>Event Requirements</h3>
        <div className={styles.list}>
          <div className={styles.listItem}>
            <svg viewBox="0 0 24 24" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span>Attendance Time Required: {event.attendanceRequired}</span>
          </div>
          <div className={styles.listItem}>
            <svg viewBox="0 0 24 24" strokeWidth="2">
              <path d="M5 3v4M19 3v4M5 7h14v14H5z" />
              <path d="M9 11h6" />
            </svg>
            <span>Grace Period: {event.gracePeriod}</span>
          </div>
          <div className={styles.listItem}>
            <svg viewBox="0 0 24 24" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <span>Required File(s): {event.requiredFiles}</span>
          </div>
        </div>
      </section>

      {invitations.length > 0 ? <InvitationListSection entries={invitations} /> : null}

      <EventGallerySection photos={photos} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.hiddenFileInput}
        aria-hidden="true"
        tabIndex={-1}
        onChange={onPhotoSelected}
      />

      <div className={styles.organizerBar}>
        <Link href={`/organized/events/${event.id}/registrations`} className={styles.attendedBtn}>
          See who attended
        </Link>
        <div className={styles.organizerTools}>
          <button type="button" className={styles.toolBtn} aria-label="Upload event photo" onClick={onPhotoButtonClick}>
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
              <path
                d="M52.5 11.25V6.25H6.25V73.75H73.75V28.75H68.75V32.7625L58.6298 22.6422L47.8125 33.4597L32.1875 17.8347L11.25 38.7722V11.25H52.5ZM58.6298 29.7134L68.75 39.8336V54.3972L51.3481 36.9952L58.6298 29.7134ZM32.1875 24.9062L68.75 61.4688V68.75H11.25V45.8438L32.1875 24.9062Z"
                fill="#448AFF"
              />
              <path d="M70 2.5H65V10H57.5V15H65V22.5H70V15H77.5V10H70V2.5Z" fill="#448AFF" />
            </svg>
          </button>
          <Link
            href={`/organized/events/${event.id}/invitations`}
            className={styles.toolBtn}
            aria-label="Invite users"
          >
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
              <path
                d="M10 10C4.47715 10 0 14.4772 0 20V60L0.000129193 60.0514C0.0277999 65.5506 4.49429 70 10 70H37.5C38.8807 70 40 68.8807 40 67.5C40 66.1193 38.8807 65 37.5 65H10C7.68575 65 5.73872 63.4277 5.16882 61.2931L33.3709 43.938L40 47.9155L75 26.9155V42.5C75 43.8807 76.1193 45 77.5 45C78.8807 45 80 43.8807 80 42.5V20C80 14.4772 75.5229 10 70 10H10ZM28.5404 41.0397L5 55.5261V26.9155L28.5404 41.0397ZM5 21.0845V20C5 17.2386 7.23858 15 10 15H70C72.7614 15 75 17.2386 75 20V21.0845L40 42.0845L5 21.0845Z"
                fill="#448AFF"
              />
              <path
                d="M80 62.5C80 72.165 72.165 80 62.5 80C52.835 80 45 72.165 45 62.5C45 52.835 52.835 45 62.5 45C72.165 45 80 52.835 80 62.5ZM62.5 52.5C61.1193 52.5 60 53.6193 60 55V60H55C53.6193 60 52.5 61.1193 52.5 62.5C52.5 63.8807 53.6193 65 55 65H60V70C60 71.3807 61.1193 72.5 62.5 72.5C63.8807 72.5 65 71.3807 65 70V65H70C71.3807 65 72.5 63.8807 72.5 62.5C72.5 61.1193 71.3807 60 70 60H65V55C65 53.6193 63.8807 52.5 62.5 52.5Z"
                fill="#448AFF"
              />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  );
}
