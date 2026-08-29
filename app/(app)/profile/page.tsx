"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { useProfileHydration } from "@/components/legacy/useProfileHydration";
import { ProfileDataBridge } from "@/components/legacy/ProfileDataBridge";
import { ChangePasswordModal } from "@/components/legacy/ChangePasswordModal";
import { ProfileOrganizerBadge } from "@/components/auth/OrganizerCues";
import { UserDisplayNameBridge } from "@/components/legacy/UserDisplayNameBridge";
import legacyProfile from "@/content/legacy/36-profile.json";

const profile = legacyProfile as LegacyPageData;

export default function ProfilePage() {
  useProfileHydration();

  return (
    <main className="main">
      <ProfileOrganizerBadge />
      <LegacyContent data={profile} />
      <ProfileDataBridge />
      <UserDisplayNameBridge />
      <ChangePasswordModal />
    </main>
  );
}
