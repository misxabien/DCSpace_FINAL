"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedEventDetailView } from "@/components/organized/OrganizedEventDetailView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import { fetchOrganizedEventLive } from "@/lib/organized/live";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const live = await fetchOrganizedEventLive(id);
        if (cancelled) return;
        if (!live) {
          router.replace("/organized/events");
          return;
        }
        setEvent(live);
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load event.");
        }
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

  if (!event) {
    return (
      <OrganizedShell title="Events Name" backHref="/organized/events">
        <p className={styles.empty}>{error || "Loading event…"}</p>
      </OrganizedShell>
    );
  }

  return (
    <OrganizedShell title={event.title} backHref="/organized/events">
      <OrganizedEventDetailView event={event} />
    </OrganizedShell>
  );
}
