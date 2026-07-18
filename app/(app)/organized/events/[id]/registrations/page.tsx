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
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventRegistrationsPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);

  useEffect(() => {
    const loaded = getOrganizedEventById(id);
    if (!loaded) {
      router.replace("/organized/events");
      return;
    }
    setEvent(loaded);
    setRegistrations(getEventRegistrations(id));
  }, [id, router]);

  useEffect(() => {
    const onStorage = () => {
      const loaded = getOrganizedEventById(id);
      if (loaded) setEvent(loaded);
      setRegistrations(getEventRegistrations(id));
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
