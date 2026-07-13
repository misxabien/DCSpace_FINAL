"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { LegacyContent } from "@/components/legacy/useLegacyPage";

export function AppLegacyPage({ data }: { data: LegacyPageData }) {
  return (
    <AppShell>
      <Sidebar />
      <main className="main">
        <LegacyContent data={data} />
      </main>
    </AppShell>
  );
}
