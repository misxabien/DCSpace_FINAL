"use client";

import {
  OrganizedEventCard,
  OrganizedShell,
  useOrganizedEvents,
} from "@/components/organized/OrganizedShell";
import { EmptyState } from "@/components/ui/EmptyState";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventsPage() {
  const { events, error } = useOrganizedEvents();

  return (
    <OrganizedShell title="Events Organized">
      <section className={styles.block} aria-labelledby="all-organized-heading">
        <div className="section-head">
          <h2 id="all-organized-heading">All Organized Events</h2>
        </div>

        {error ? (
          <EmptyState
            title="Couldn’t load organized events."
            description={`${error} Try signing out and back in, then refresh this page.`}
          />
        ) : events.length === 0 ? (
          <EmptyState
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
