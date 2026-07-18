"use client";

import { useEffect } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { useProfileHydration } from "@/components/legacy/useProfileHydration";
import { useAuth } from "@/components/auth/AuthProvider";
import legacyHome from "@/content/legacy/09-home.json";

const home = legacyHome as LegacyPageData;

function SyncUserName() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.name) return;
    document.querySelectorAll(".main__user-name").forEach((el) => {
      el.textContent = user.name;
    });
    document.querySelectorAll(".joined-head, .main__greeting").forEach((el) => {
      if (el.textContent?.includes("Hello")) {
        el.textContent = `Hello, ${user.name}!`;
      }
    });
  }, [user]);

  return null;
}

export default function HomePage() {
  useProfileHydration();

  return (
    <AppShell>
      <Sidebar />
      <main className="main">
        <LegacyContent data={home} />
        <SyncUserName />
      </main>
    </AppShell>
  );
}
