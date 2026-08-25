"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { SavedEventsBridge } from "@/components/legacy/SavedEventsBridge";
import { StudentDataBridge } from "@/components/legacy/StudentDataBridge";
import { useProfileHydration } from "@/components/legacy/useProfileHydration";
import { UserDisplayNameBridge } from "@/components/legacy/UserDisplayNameBridge";
import legacyHome from "@/content/legacy/09-home.json";

const home = legacyHome as LegacyPageData;

export default function HomePage() {
  useProfileHydration();

  return (
    <AppShell>
      <Sidebar />
      <main className="main">
        <LegacyContent data={home} />
      </main>
      <UserDisplayNameBridge />
      <SavedEventsBridge />
      <StudentDataBridge />
    </AppShell>
  );
}
