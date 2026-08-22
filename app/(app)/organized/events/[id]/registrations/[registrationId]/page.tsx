"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedParticipantView } from "@/components/organized/OrganizedParticipantView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import {
  getOrganizedEventById,
  type OrganizedEventDetail,
} from "@/lib/organizedEventDetails";
import {
  getParticipantDetail,
  type ParticipantDetail,
} from "@/lib/organizedRegistrations";
import {
  fetchOrganizedEventLive,
  fetchParticipantDetailLive,
} from "@/lib/organized/live";
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

    async function load() {
      try {
        const liveEvent = await fetchOrganizedEventLive(eventId);
        if (cancelled) return;
        if (liveEvent) {
          const liveParticipant = await fetchParticipantDetailLive(
            eventId,
            registrationId,
            liveEvent.requiredFiles,
          );
          if (liveParticipant) {
            setEvent(liveEvent);
            setParticipant(liveParticipant);
            return;
          }
        }
      } catch {
        /* fall back */
      }

      const loadedEvent = getOrganizedEventById(eventId);
      if (!loadedEvent) {
        router.replace("/organized/events");
        return;
      }
      const loadedParticipant = getParticipantDetail(
        eventId,
        registrationId,
        loadedEvent.requiredFiles,
      );
      if (!loadedParticipant) {
        router.replace(`/organized/events/${encodeURIComponent(eventId)}/registrations`);
        return;
      }
      if (!cancelled) {
        setEvent(loadedEvent);
        setParticipant(loadedParticipant);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId, registrationId, router]);

  if (!event || !participant) {
    return (
      <OrganizedShell title="Events Name">
        <p className={styles.empty}>Loading participant…</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title}>
      <OrganizedParticipantView event={event} participant={participant} />
    </OrganizedShell>
  );
}
