"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedRegistrationsView } from "@/components/organized/OrganizedRegistrationsView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { EventRegistration } from "@/lib/organizedRegistrations";
import {
  fetchEventRegistrationsLive,
  fetchOrganizedEventLive,
  mapLiveRegistration,
} from "@/lib/organized/live";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventRegistrationsPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      try {
        const [liveEvent, liveRegs] = await Promise.all([
          fetchOrganizedEventLive(id),
          fetchEventRegistrationsLive(id),
        ]);
        if (cancelled) return;
        if (!liveEvent) {
          router.replace("/organized/events");
          return;
        }
        setEvent(liveEvent);
        setRegistrations(liveRegs.map(mapLiveRegistration));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load registrations.");
          setRegistrations([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 12000);
    const onChange = () => void load();
    window.addEventListener("dc-organized-changed", onChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("dc-organized-changed", onChange);
    };
  }, [id, router]);

  if (loading && !event) {
    return (
      <OrganizedShell title="Events Name" backHref="/organized/events">
        <p className={styles.empty}>Loading registrations…</p>
      </OrganizedShell>
    );
  }

  if (!event) {
    return (
      <OrganizedShell title="Events Name" backHref="/organized/events">
        <p className={styles.empty}>{error || "Event not found."}</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title} backHref={`/organized/events/${encodeURIComponent(event.id)}`}>
      {error ? <p className={styles.empty}>{error}</p> : null}
      <OrganizedRegistrationsView event={event} registrations={registrations} />
    </OrganizedShell>
  );
}
