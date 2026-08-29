"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { SavedEventsBridge } from "@/components/legacy/SavedEventsBridge";
import { StudentDataBridge } from "@/components/legacy/StudentDataBridge";
import { useProfileHydration } from "@/components/legacy/useProfileHydration";
import { UserDisplayNameBridge } from "@/components/legacy/UserDisplayNameBridge";
import { ChangePasswordModal } from "@/components/legacy/ChangePasswordModal";

export function AppLegacyPage({
  data,
  mainClassName,
}: {
  data: LegacyPageData;
  mainClassName?: string;
}) {
  useProfileHydration();

  return (
    <>
      <main className={mainClassName ? `main ${mainClassName}` : "main"} key={data.id}>
        <LegacyContent data={data} />
      </main>
      <UserDisplayNameBridge />
      <SavedEventsBridge />
      <StudentDataBridge />
      <ChangePasswordModal />
    </>
  );
}
