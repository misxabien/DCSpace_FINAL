"use client";

import { useEffect } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
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
  return (
    <AppShell>
      <Sidebar />
      <main className="main">
        <LegacyContent data={profile} />
        <SyncProfileName />
      </main>
    </AppShell>
  );
}
