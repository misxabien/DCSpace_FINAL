"use client";

import { useEffect } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { useProfileHydration } from "@/components/legacy/useProfileHydration";
import { ChangePasswordModal } from "@/components/legacy/ChangePasswordModal";
import { ProfileOrganizerBadge } from "@/components/auth/OrganizerCues";
import { useAuth } from "@/components/auth/AuthProvider";
import legacyProfile from "@/content/legacy/36-profile.json";

const profile = legacyProfile as LegacyPageData;

function SyncProfileName() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.name) return;
    document.querySelectorAll(".main__user-name, .profile-name, .profile__name").forEach((el) => {
      el.textContent = user.name;
    });
  }, [user]);

  return null;
}

export default function ProfilePage() {
  useProfileHydration();

  return (
    <AppShell>
      <Sidebar />
      <main className="main">
        <ProfileOrganizerBadge />
        <LegacyContent data={profile} />
        <SyncProfileName />
        <ChangePasswordModal />
      </main>
    </AppShell>
  );
}
