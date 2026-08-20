"use client";

import { Suspense } from "react";
import { CreateEventView } from "@/components/organized/CreateEventView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";

export default function CreateEventPage() {
  return (
    <OrganizedShell title="Create an Event!">
      <Suspense fallback={<p>Loading form…</p>}>
        <CreateEventView />
      </Suspense>
    </OrganizedShell>
  );
}
