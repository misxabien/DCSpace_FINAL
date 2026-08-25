"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { applyUserDisplayNameToDom } from "@/lib/user-api";

/**
 * Keeps `.main__user-name` (and greetings) in sync on every student page.
 * Re-applies after soft-nav / LegacyContent mounts, which otherwise reinject
 * the static "Your Name" placeholder from legacy HTML.
 */
export function UserDisplayNameBridge() {
  const { user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const sync = () => {
      applyUserDisplayNameToDom(user?.name);
    };

    sync();
    // Legacy HTML mounts one frame later — catch the placeholder reinject.
    const raf = window.requestAnimationFrame(sync);
    const t1 = window.setTimeout(sync, 0);
    const t2 = window.setTimeout(sync, 50);
    const t3 = window.setTimeout(sync, 200);

    window.addEventListener("dcspace-profile-updated", sync);
    window.addEventListener("dc-legacy-content-ready", sync);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("dcspace-profile-updated", sync);
      window.removeEventListener("dc-legacy-content-ready", sync);
    };
  }, [user?.name, pathname]);

  return null;
}
