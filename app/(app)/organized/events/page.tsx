"use client";

import Link from "next/link";
import {
  OrganizedEventCard,
  OrganizedShell,
  useOrganizedEvents,
} from "@/components/organized/OrganizedShell";
import { EmptyState, ORGANIZED_EMPTY_STATE_ICON } from "@/components/ui/EmptyState";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventsPage() {
  const { events, error } = useOrganizedEvents();

  return (
    <OrganizedShell title="Events Organized">
      <Link href="/organized" className="back-btn">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to Create Event
      </Link>

      <section className={styles.block} aria-labelledby="all-organized-heading">
        <div className="section-head">
          <h2 id="all-organized-heading">All Organized Events</h2>
        </div>

        {error ? (
          <EmptyState
            iconSrc={ORGANIZED_EMPTY_STATE_ICON}
            title="Couldn’t load organized events."
            description={`${error} Try signing out and back in, then refresh this page.`}
          />
        ) : events.length === 0 ? (
          <EmptyState
            iconSrc={ORGANIZED_EMPTY_STATE_ICON}
            title="No organized events yet."
            description="Create your first event and it will appear here once it’s saved to your account."
          />
        ) : (
          <div className="event-grid event-grid--single-row">
            {events.map((event) => (
              <OrganizedEventCard
                key={event.id}
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
