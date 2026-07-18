"use client";

import { CreateEventView } from "@/components/organized/CreateEventView";
import { OrganizedShell } from "@/components/organized/OrganizedShell";

export default function CreateEventPage() {
  return (
    <OrganizedShell title="Create an Event!">
      <CreateEventView />
    </OrganizedShell>
  );
}
