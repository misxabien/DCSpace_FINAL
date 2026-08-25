"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { SavedEventsBridge } from "@/components/legacy/SavedEventsBridge";
import { StudentDataBridge } from "@/components/legacy/StudentDataBridge";
import { useProfileHydration } from "@/components/legacy/useProfileHydration";
import { UserDisplayNameBridge } from "@/components/legacy/UserDisplayNameBridge";
import { ChangePasswordModal } from "@/components/legacy/ChangePasswordModal";

export function AppLegacyPage({ data }: { data: LegacyPageData }) {
  useProfileHydration();

  return (
    <AppShell>
      <Sidebar />
      <main className="main">
        <LegacyContent data={data} />
      </main>
      <UserDisplayNameBridge />
      <SavedEventsBridge />
      <StudentDataBridge />
      <ChangePasswordModal />
    </AppShell>
  );
}
