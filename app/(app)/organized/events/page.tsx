"use client";

import {
  OrganizedEventCard,
  OrganizedShell,
  useOrganizedEvents,
} from "@/components/organized/OrganizedShell";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventsPage() {
  const events = useOrganizedEvents();

  return (
    <OrganizedShell title="Events Organized">
      <section className={styles.block} aria-labelledby="all-organized-heading">
        <div className="section-head">
          <h2 id="all-organized-heading">All Organized Events</h2>
        </div>

        {events.length === 0 ? (
          <p className={styles.empty}>No organized events yet. Create your first event.</p>
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
