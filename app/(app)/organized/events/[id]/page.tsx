"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizedEventDetailView } from "@/components/organized/OrganizedEventDetailView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";
import {
  getOrganizedEventById,
  type OrganizedEventDetail,
} from "@/lib/organizedEventDetails";
import { fetchOrganizedEventLive } from "@/lib/organized/live";
import styles from "@/components/organized/Organized.module.css";

export default function OrganizedEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [event, setEvent] = useState<OrganizedEventDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const live = await fetchOrganizedEventLive(id);
        if (cancelled) return;
        if (live) {
          setEvent(live);
          return;
        }
      } catch {
        /* fall back to local cache */
      }
      const local = getOrganizedEventById(id);
      if (!local) {
        router.replace("/organized/events");
        return;
      }
      if (!cancelled) setEvent(local);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  useEffect(() => {
    const onStorage = async () => {
      try {
        const live = await fetchOrganizedEventLive(id);
        if (live) {
          setEvent(live);
          return;
        }
      } catch {
        /* ignore */
      }
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
