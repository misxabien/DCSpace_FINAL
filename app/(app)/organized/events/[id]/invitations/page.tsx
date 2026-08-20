"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedInvitationsView } from "@/components/organized/OrganizedInvitationsView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import { fetchOrganizedEventLive } from "@/lib/organized/live";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventInvitationsPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const loaded = await fetchOrganizedEventLive(id);
      if (cancelled) return;
      if (!loaded) {
        router.replace("/organized/events");
        return;
      }
      setEvent(loaded);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (!event) {
    return (
      <OrganizedShell title="Events Name">
        <p className={styles.empty}>Loading invitations…</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title} backHref={`/organized/events/${event.id}`}>
      <OrganizedInvitationsView event={event} />
    </OrganizedShell>
  );
}
