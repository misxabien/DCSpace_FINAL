"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { useProfileHydration } from "@/components/legacy/useProfileHydration";
import { ChangePasswordModal } from "@/components/legacy/ChangePasswordModal";

export function AppLegacyPage({ data }: { data: LegacyPageData }) {
  useProfileHydration();

  return (
    <AppShell>
      <Sidebar />
      <main className="main">
        <LegacyContent data={data} />
      </main>
      <ChangePasswordModal />
    </AppShell>
  );
}
