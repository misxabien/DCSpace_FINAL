"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { EventGallerySection } from "@/components/organized/EventGallerySection";
import { InvitationListSection } from "@/components/organized/InvitationListSection";
import { OrganizedEventHeader } from "@/components/organized/OrganizedEventHeader";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { EventGalleryPhoto } from "@/lib/organizedEventGallery";
import type { InvitationListEntry } from "@/lib/organizedInvitations";
import styles from "@/components/organized/OrganizedDetail.module.css";

function IconVenueType() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </svg>
  );
}
function IconEventType() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function IconHostedPeople() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
function IconHostedBook() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
}
function IconHostedBuilding() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2">
      <path d="M3 21h18M6 21V7h12v14" />
      <path d="M9 21v-4h6v4" />
    </svg>
  );
}
function IconAttendanceTime() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
function IconGracePeriod() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2">
      <path d="M5 3v4M19 3v4M5 7h14v14H5z" />
      <path d="M9 11h6" />
    </svg>
  );
}
function IconRequiredFile() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function OrganizedEventDetailView({ event }: { event: OrganizedEventDetail }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [invitations, setInvitations] = useState<InvitationListEntry[]>([]);
  const [photos, setPhotos] = useState<EventGalleryPhoto[]>([]);

  const loadDetailData = async () => {
    try {
      const [inviteRes, galleryRes] = await Promise.all([
        fetch(`/api/organized/events/${encodeURIComponent(event.id)}/invitations`, {
          cache: "no-store",
        }),
        fetch(`/api/organized/events/${encodeURIComponent(event.id)}/gallery`, {
          cache: "no-store",
        }),
      ]);
      if (inviteRes.ok) {
        const payload = (await inviteRes.json()) as {
          invitations?: Array<{
            id: string;
            userName: string;
            course: string;
            organization: string;
            status: string;
          }>;
        };
        setInvitations(
          (payload.invitations || []).map((row) => ({
            id: row.id,
            name: row.userName,
            course: row.course || "—",
            organization: row.organization || "—",
            status: row.status === "joined" ? "joined" : "pending",
          })),
        );
      } else {
        setInvitations([]);
      }
      if (galleryRes.ok) {
        const payload = (await galleryRes.json()) as { photos?: EventGalleryPhoto[] };
        setPhotos(payload.photos || []);
      } else {
        setPhotos([]);
      }
    } catch {
      setInvitations([]);
      setPhotos([]);
    }
  };

  useEffect(() => {
    void loadDetailData();
  }, [event.id]);

  useEffect(() => {
    const onChange = () => void loadDetailData();
    window.addEventListener("dc-invites-changed", onChange);
    window.addEventListener("dc-gallery-changed", onChange);
    return () => {
      window.removeEventListener("dc-invites-changed", onChange);
      window.removeEventListener("dc-gallery-changed", onChange);
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
        void fetch(`/api/organized/events/${encodeURIComponent(event.id)}/gallery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: reader.result }),
        }).then(() => {
          window.dispatchEvent(new Event("dc-gallery-changed"));
        });
      };
      reader.readAsDataURL(file);
    });

    eventChange.target.value = "";
  };

  const canEdit =
    event.reviewStatus === "pending" ||
    event.reviewStatus === "rejected" ||
    event.reviewStatus === "draft" ||
    event.status === "draft";

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
            <IconVenueType />
            <span>Venue Type ({event.venueType})</span>
          </div>
          <div className={styles.listItem}>
            <IconEventType />
            <span>Event Type ({event.eventType})</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3>Hosted By</h3>
        <div className={styles.list}>
          <div className={styles.listItem}>
            <IconHostedPeople />
            <span>{event.organization}</span>
          </div>
          <div className={styles.listItem}>
            <IconHostedBook />
            <span>{event.course}</span>
          </div>
          <div className={styles.listItem}>
            <IconHostedBuilding />
            <span>{event.department}</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3>Event Requirements</h3>
        <div className={styles.list}>
          {event.venueType === "On Campus" ? (
            <div className={styles.listItem}>
              <IconVenueType />
              <span>
                Room Reservation:{" "}
                {event.iroomStatus === "approved"
                  ? event.iroomRoomName
                    ? `Approved — ${event.iroomRoomName}`
                    : "Approved"
                  : event.iroomStatus === "pending"
                    ? "Pending approval"
                    : event.iroomStatus === "rejected"
                      ? event.iroomRejectionReason
                        ? `Rejected — ${event.iroomRejectionReason}`
                        : "Rejected"
                      : event.iroomStatus === "cancelled"
                        ? "Cancelled"
                        : "Not requested"}
              </span>
            </div>
          ) : null}
          <div className={styles.listItem}>
            <IconAttendanceTime />
            <span>Attendance Time Required: {event.attendanceRequired}</span>
          </div>
          <div className={styles.listItem}>
            <IconGracePeriod />
            <span>Grace Period: {event.gracePeriod}</span>
          </div>
          <div className={styles.listItem}>
            <IconRequiredFile />
            <span>Required File(s): {event.requiredFiles}</span>
          </div>
          {(event.attachments || []).map((file) => (
            <div className={styles.listItem} key={file.url}>
              <svg viewBox="0 0 24 24" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span>
                {file.label}:{" "}
                <a
                  className={styles.fileLink}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {file.fileName}
                </a>
              </span>
            </div>
          ))}
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
          {canEdit ? (
            <Link
              href={`/organized/create?id=${encodeURIComponent(event.id)}`}
              className={styles.toolBtn}
              aria-label="Edit event"
            >
              Edit
            </Link>
          ) : null}
          <button
            type="button"
            className={styles.toolBtn}
            aria-label="Upload event photo"
            onClick={onPhotoButtonClick}
          >
            Upload photos
          </button>
          <Link
            href={`/organized/events/${event.id}/invitations`}
            className={styles.toolBtn}
            aria-label="Invite users"
          >
            Invite
          </Link>
        </div>
      </div>
    </article>
  );
}
