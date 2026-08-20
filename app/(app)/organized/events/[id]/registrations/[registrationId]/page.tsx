"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedParticipantView } from "@/components/organized/OrganizedParticipantView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import {
  fetchEventRegistrationsLive,
  fetchOrganizedEventLive,
  mapLiveParticipant,
} from "@/lib/organized/live";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { ParticipantDetail } from "@/lib/organizedRegistrations";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedParticipantPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = String(params.id ?? "");
  const registrationId = String(params.registrationId ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);
  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const loadedEvent = await fetchOrganizedEventLive(eventId);
      if (cancelled) return;
      if (!loadedEvent) {
        router.replace("/organized/events");
        return;
      }
      const rows = await fetchEventRegistrationsLive(eventId);
      const row = rows.find((item) => item.id === registrationId);
      if (!row) {
        router.replace(`/organized/events/${eventId}/registrations`);
        return;
      }
      setEvent(loadedEvent);
      setParticipant(mapLiveParticipant(row, loadedEvent.requiredFiles));
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    window.addEventListener("dc-participant-changed", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("dc-participant-changed", load);
    };
  }, [eventId, registrationId, router]);

  if (!event || !participant) {
    return (
      <OrganizedShell title="Events Name" backHref={`/organized/events/${eventId}/registrations`}>
        <p className={styles.empty}>Loading participant…</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title} backHref={`/organized/events/${event.id}/registrations`}>
      <OrganizedParticipantView event={event} participant={participant} />
    </OrganizedShell>
  );
}
