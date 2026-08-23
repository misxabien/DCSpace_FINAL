"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedParticipantView } from "@/components/organized/OrganizedParticipantView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { ParticipantDetail } from "@/lib/organizedRegistrations";
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
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const liveEvent = await fetchOrganizedEventLive(eventId);
        if (cancelled) return;
        if (!liveEvent) {
          router.replace("/organized/events");
          return;
        }
        const liveParticipant = await fetchParticipantDetailLive(
          eventId,
          registrationId,
          liveEvent.requiredFiles,
        );
        if (!liveParticipant) {
          router.replace(`/organized/events/${encodeURIComponent(eventId)}/registrations`);
          return;
        }
        setEvent(liveEvent);
        setParticipant(liveParticipant);
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load participant.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId, registrationId, router]);

  if (!event || !participant) {
    return (
      <OrganizedShell title="Events Name" backHref={`/organized/events/${encodeURIComponent(eventId)}/registrations`}>
        <p className={styles.empty}>{error || "Loading participant…"}</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title} backHref={`/organized/events/${encodeURIComponent(eventId)}/registrations`}>
      <OrganizedParticipantView event={event} participant={participant} />
    </OrganizedShell>
  );
}
