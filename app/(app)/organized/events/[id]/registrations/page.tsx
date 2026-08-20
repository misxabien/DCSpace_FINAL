"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedRegistrationsView } from "@/components/organized/OrganizedRegistrationsView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import { fetchEventRegistrationsLive, fetchOrganizedEventLive } from "@/lib/organized/live";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { EventRegistration } from "@/lib/organizedRegistrations";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventRegistrationsPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);

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
      setRegistrations(await fetchEventRegistrationsLive(id));
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, router]);

  if (!event) {
    return (
      <OrganizedShell title="Events Name">
        <p className={styles.empty}>Loading registrations…</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title} backHref={`/organized/events/${event.id}`}>
      <OrganizedRegistrationsView event={event} registrations={registrations} />
    </OrganizedShell>
  );
}
