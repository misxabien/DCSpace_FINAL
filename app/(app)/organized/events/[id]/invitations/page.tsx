"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedInvitationsView } from "@/components/organized/OrganizedInvitationsView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import {
  getOrganizedEventById,
  type OrganizedEventDetail,
} from "@/lib/organizedEventDetails";
import { fetchOrganizedEventLive } from "@/lib/organized/live";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventInvitationsPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const live = await fetchOrganizedEventLive(id);
        if (cancelled) return;
        if (live) {
          setEvent(live);
          return;
        }
      } catch {
        /* fall back */
      }
      const local = getOrganizedEventById(id);
      if (!local) {
        router.replace("/organized/events");
        return;
      }
      if (!cancelled) setEvent(local);
    }

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
    <OrganizedShell title={event.title}>
      <OrganizedInvitationsView event={event} />
    </OrganizedShell>
  );
}
