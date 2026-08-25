"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  OrganizedEventCard,
  OrganizedShell,
  useOrganizedEvents,
  type OrganizedEvent,
} from "@/components/organized/OrganizedShell";
import { EmptyState } from "@/components/ui/EmptyState";
import styles from "@/components/organized/Organized.module.css";

function matchesQuery(event: OrganizedEvent, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [event.title, event.venue, event.time, event.reviewNote || ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function Section({
  id,
  title,
  href,
  events,
}: {
  id: string;
  title: string;
  href: string;
  events: OrganizedEvent[];
}) {
  return (
    <section className={styles.block} aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        <Link href={href} className="section-head__more" aria-label={`See more ${title}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      </div>

      {events.length === 0 ? (
        <EmptyState
          compact
          title="No events in this section."
          description="When matching submissions are available, they will appear here."
        />
      ) : (
        <div className="event-grid event-grid--single-row">
          {events.slice(0, 2).map((event) => (
            <OrganizedEventCard
              key={event.id}
              event={event}
              showReviewNote
              detailHref={`/organized/events/${event.id}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function SubmissionsPage() {
  const { events, error } = useOrganizedEvents();
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => events.filter((event) => matchesQuery(event, query.trim())),
    [events, query]
  );

  const pending = filtered.filter((event) => event.reviewStatus === "pending");
  const drafts = filtered.filter((event) => event.reviewStatus === "draft" || (!event.reviewStatus && event.status === "draft"));
  const inactive = filtered.filter(
    (event) =>
      event.status === "closed" ||
      event.reviewStatus === "rejected" ||
      event.reviewStatus === "completed" ||
      event.reviewStatus === "cancelled",
  );

  return (
    <OrganizedShell title="Events Organized">
      <div className={styles.submissionsHead}>
        <h2 className={styles.submissionsTitle}>Event Submissions</h2>
        <div className={styles.submissionsTools}>
          <div className="search-bar search-bar--inline">
            <div className="search-bar__field">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="search"
                placeholder="Search"
                aria-label="Search event submissions"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <EmptyState
          compact
          title="Couldn’t load submissions."
          description={`${error} Try signing out and back in, then refresh this page.`}
        />
      ) : null}

      <Section
        id="pending-heading"
        title="Pending for Approval"
        href="/organized/submissions#pending-heading"
        events={pending}
      />
      <Section
        id="drafts-heading"
        title="Drafts"
        href="/organized/submissions#drafts-heading"
        events={drafts}
      />
      <Section
        id="inactive-heading"
        title="Inactive Events"
        href="/organized/submissions#inactive-heading"
        events={inactive}
      />
    </OrganizedShell>
  );
}
