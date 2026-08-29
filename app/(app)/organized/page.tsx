"use client";

import Link from "next/link";
import {
  OrganizedEventCard,
  OrganizedShell,
  useOrganizedEvents,
} from "@/components/organized/OrganizedShell";
import { EmptyState, ORGANIZED_EMPTY_STATE_ICON } from "@/components/ui/EmptyState";
import styles from "@/components/organized/Organized.module.css";

function SectionHead({
  id,
  title,
  href,
  label,
  showMore = true,
}: {
  id: string;
  title: string;
  href: string;
  label: string;
  showMore?: boolean;
}) {
  return (
    <div className="section-head">
      <h2 id={id}>{title}</h2>
      {showMore ? (
        <Link href={href} className="section-head__more" aria-label={label}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}

export default function OrganizedPage() {
  const { events, error } = useOrganizedEvents();
  const preview = events.slice(0, 2);
  const submissionEvents = events.filter((event) => event.submissions > 0).slice(0, 3);
  const submissionPreview =
    submissionEvents.length > 0 ? submissionEvents : events.slice(0, 3);

  return (
    <OrganizedShell title="Organize an Event!">
      <section className={styles.banner} aria-label="Create an event">
        <div>
          <h2 className={styles.bannerTitle}>Create an Event with DC SPACE!</h2>
          <p className={styles.bannerText}>
            Planning a seminar, event, or organization activity? Create and manage everything with DC
            Space.
          </p>
        </div>
        <Link href="/organized/create" className={styles.bannerBtn}>
          Create Event
        </Link>
      </section>

      <section className={styles.block} aria-labelledby="organized-events-heading">
        <SectionHead
          id="organized-events-heading"
          title="All Organized Events"
          href="/organized/events"
          label="See all organized events"
          showMore={!error && events.length > 2}
        />
        {error ? (
          <EmptyState
            compact
            iconSrc={ORGANIZED_EMPTY_STATE_ICON}
            title="Couldn’t load organized events."
            description={`${error} Try signing out and back in, then refresh this page.`}
          />
        ) : preview.length === 0 ? (
          <EmptyState
            compact
            iconSrc={ORGANIZED_EMPTY_STATE_ICON}
            title="No organized events yet."
            description="Create your first event and it will appear here once it’s saved to your account."
          />
        ) : (
          <div className="event-grid event-grid--single-row">
            {preview.map((event) => (
              <OrganizedEventCard
                key={event.id}
                event={event}
                detailHref={`/organized/events/${event.id}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className={styles.block} aria-labelledby="submissions-heading">
        <SectionHead
          id="submissions-heading"
          title="Event Submissions"
          href="/organized/submissions"
          label="See event submissions"
          showMore={events.length > 2}
        />
        {submissionPreview.length === 0 ? (
          <EmptyState
            compact
            iconSrc={ORGANIZED_EMPTY_STATE_ICON}
            title="No submissions yet."
            description="Events you’ve submitted for approval will show up here with their review status."
          />
        ) : (
          <div className="event-grid event-grid--single-row">
            {submissionPreview.map((event) => (
              <OrganizedEventCard
                key={`sub-${event.id}`}
                event={event}
                detailHref={`/organized/events/${event.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </OrganizedShell>
  );
}
