"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedRegistrationsView } from "@/components/organized/OrganizedRegistrationsView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import {
  getOrganizedEventById,
  type OrganizedEventDetail,
} from "@/lib/organizedEventDetails";
import {
  getEventRegistrations,
  type EventRegistration,
} from "@/lib/organizedRegistrations";
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [liveEvent, liveRegs] = await Promise.all([
          fetchOrganizedEventLive(id),
          fetchEventRegistrationsLive(id),
        ]);
        if (cancelled) return;
        if (liveEvent) {
          setEvent(liveEvent);
          if (liveRegs.length) {
            setRegistrations(liveRegs.map(mapLiveRegistration));
            return;
          }
        }
      } catch {
        /* fall back */
      }

      const loaded = getOrganizedEventById(id);
      if (!loaded) {
        router.replace("/organized/events");
        return;
      }
      if (!cancelled) {
        setEvent(loaded);
        setRegistrations(getEventRegistrations(id));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  useEffect(() => {
    const onStorage = async () => {
      try {
        const liveRegs = await fetchEventRegistrationsLive(id);
        if (liveRegs.length) {
          setRegistrations(liveRegs.map(mapLiveRegistration));
        }
        const liveEvent = await fetchOrganizedEventLive(id);
        if (liveEvent) setEvent(liveEvent);
      } catch {
        const loaded = getOrganizedEventById(id);
        if (loaded) setEvent(loaded);
        setRegistrations(getEventRegistrations(id));
      }
    };
    window.addEventListener("dc-organized-changed", onStorage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("dc-organized-changed", onStorage);
      window.removeEventListener("storage", onStorage);
    };
  }, [id]);

  if (!event) {
    return (
      <OrganizedShell title="Events Name">
        <p className={styles.empty}>Loading registrations…</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title}>
      <OrganizedRegistrationsView event={event} registrations={registrations} />
    </OrganizedShell>
  );
}
