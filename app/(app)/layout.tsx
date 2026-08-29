"use client";

import { AppShell, Sidebar } from "@/components/layout/Sidebar";
import { AppMainTransition } from "@/components/motion/AppMainTransition";

export default function StudentAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Sidebar />
      <div className="app-main">
        <AppMainTransition>{children}</AppMainTransition>
      </div>
    </AppShell>
  );
}
