"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedEventDetailView } from "@/components/organized/OrganizedEventDetailView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import { fetchOrganizedEventLive } from "@/lib/organized/live";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const loaded = await fetchOrganizedEventLive(id);
      if (cancelled) return;
      if (!loaded) {
        setMissing(true);
        router.replace("/organized/events");
        return;
      }
      setEvent(loaded);
    };
    void load();
    const timer = window.setInterval(() => void load(), 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, router]);

  if (missing || !event) {
    return (
      <OrganizedShell title="Events Name" backHref="/organized/events">
        <p className={styles.empty}>
          {missing ? "Event not found." : "Loading event…"}
        </p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title} backHref="/organized/events">
      <OrganizedEventDetailView event={event} />
    </OrganizedShell>
  );
}
