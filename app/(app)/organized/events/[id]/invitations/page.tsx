"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedInvitationsView } from "@/components/organized/OrganizedInvitationsView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import { fetchOrganizedEventLive } from "@/lib/organized/live";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventInvitationsPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const live = await fetchOrganizedEventLive(id);
        if (cancelled) return;
        if (!live) {
          router.replace("/organized/events");
          return;
        }
        setEvent(live);
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load invitations.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (!event) {
    return (
      <OrganizedShell title="Events Name" backHref={`/organized/events/${encodeURIComponent(id)}`}>
        <p className={styles.empty}>{error || "Loading invitations…"}</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title} backHref={`/organized/events/${encodeURIComponent(id)}`}>
      <OrganizedInvitationsView event={event} />
    </OrganizedShell>
  );
}
