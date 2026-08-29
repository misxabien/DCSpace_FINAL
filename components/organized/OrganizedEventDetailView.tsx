"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { EventGallerySection } from "@/components/organized/EventGallerySection";
import {
  IconAttendanceTime,
  IconEventType,
  IconGracePeriod,
  IconHostedBook,
  IconHostedBuilding,
  IconHostedPeople,
  IconRequiredFile,
  IconVenueType,
} from "@/components/organized/EventDetailIcons";
import { InvitationListSection } from "@/components/organized/InvitationListSection";
import { OrganizedEventHeader } from "@/components/organized/OrganizedEventHeader";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { EventGalleryPhoto } from "@/lib/organizedEventGallery";
import type { InvitationListEntry } from "@/lib/organizedInvitations";
import styles from "@/components/organized/OrganizedDetail.module.css";

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

  const editHref = `/organized/create?id=${encodeURIComponent(event.id)}`;

  return (
    <article className={`detail-page ${styles.page}`}>
      <OrganizedEventHeader event={event} editHref={editHref} />

      <hr className="detail-divider" />

      <section className="detail-section">
        <h3>Event Announcements</h3>
        {event.announcements.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
      </section>

      <section className={`detail-section ${styles.section}`}>
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

      <section className={`detail-section ${styles.section}`}>
        <h3>Hosted By</h3>
        <div className={styles.list}>
          <div className={styles.listItem}>
            <IconHostedPeople className={styles.detailListIcon} />
            <span>{event.organization}</span>
          </div>
          <div className={styles.listItem}>
            <IconHostedBook className={styles.detailListIcon} />
            <span>{event.course}</span>
          </div>
          <div className={styles.listItem}>
            <IconHostedBuilding className={styles.detailListIcon} />
            <span>{event.department}</span>
          </div>
        </div>
      </section>

      {event.speakers?.length ? (
        <section className={`detail-section ${styles.section}`}>
          <h3>Speakers</h3>
          <div className={styles.list}>
            {event.speakers.map((speaker) => (
              <div className={styles.listItem} key={speaker}>
                <IconHostedPeople className={styles.detailListIcon} />
                <span>{speaker}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {event.programActivities?.length ? (
        <section className={`detail-section ${styles.section}`}>
          <h3>Program Flow</h3>
          <ul className={styles.programFlowList}>
            {event.programActivities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {event.audienceSchools?.length ? (
        <section className={`detail-section ${styles.section}`}>
          <h3>Audience / Schools</h3>
          <div className={styles.list}>
            {event.audienceSchools.map((school) => (
              <div className={styles.listItem} key={school}>
                <IconHostedBook className={styles.detailListIcon} />
                <span>{school}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {event.collaboratingDepartments?.length ? (
        <section className={`detail-section ${styles.section}`}>
          <h3>Collaborating Departments</h3>
          <div className={styles.list}>
            {event.collaboratingDepartments.map((dept) => (
              <div className={styles.listItem} key={dept}>
                <IconHostedBuilding className={styles.detailListIcon} />
                <span>{dept}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`detail-section ${styles.section}`}>
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
            <IconAttendanceTime className={styles.detailListIcon} />
            <span>Attendance Time Required: {event.attendanceRequired}</span>
          </div>
          <div className={styles.listItem}>
            <IconGracePeriod className={styles.detailListIcon} />
            <span>Grace Period: {event.gracePeriod}</span>
          </div>
          <div className={styles.listItem}>
            <IconRequiredFile className={styles.detailListIcon} />
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
