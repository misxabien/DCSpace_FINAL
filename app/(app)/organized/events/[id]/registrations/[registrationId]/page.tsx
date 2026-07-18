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
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedParticipantPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = String(params.id ?? "");
  const registrationId = String(params.registrationId ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);
  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);

  const load = () => {
    const loadedEvent = getOrganizedEventById(eventId);
    if (!loadedEvent) {
      router.replace("/organized/events");
      return;
    }

    const loadedParticipant = getParticipantDetail(
      eventId,
      registrationId,
      loadedEvent.requiredFiles
    );

    if (!loadedParticipant) {
      router.replace(`/organized/events/${eventId}/registrations`);
      return;
    }

    setEvent(loadedEvent);
    setParticipant(loadedParticipant);
  };

  useEffect(() => {
    load();
  }, [eventId, registrationId, router]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener("dc-participant-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("dc-participant-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [eventId, registrationId]);

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
