"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedEventDetailView } from "@/components/organized/OrganizedEventDetailView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import {
  getOrganizedEventById,
  type OrganizedEventDetail,
} from "@/lib/organizedEventDetails";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);

  useEffect(() => {
    const loaded = getOrganizedEventById(id);
    if (!loaded) {
      router.replace("/organized/events");
      return;
    }
    setEvent(loaded);
  }, [id, router]);

  useEffect(() => {
    const onStorage = () => {
      const loaded = getOrganizedEventById(id);
      if (loaded) setEvent(loaded);
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
        <p className={styles.empty}>Loading event…</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title}>
      <OrganizedEventDetailView event={event} />
    </OrganizedShell>
  );
}
