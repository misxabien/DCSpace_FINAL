"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AdminLoginBridge } from "@/components/auth/AdminLoginBridge";
import { AdminRegisterBridge } from "@/components/auth/AdminRegisterBridge";
import { AdminDataBridge } from "@/components/auth/AdminDataBridge";
import { AdminEventActionsBridge } from "@/components/auth/AdminEventActionsBridge";
import { AdminEventsTabsBridge } from "@/components/auth/AdminEventsTabsBridge";
import { AdminOpsBridge } from "@/components/auth/AdminOpsBridge";
import { AdminAiBridge } from "@/components/auth/AdminAiBridge";
import { AdminEventPhotosBridge } from "@/components/auth/AdminEventPhotosBridge";
import { useAuth } from "@/components/auth/AuthProvider";
import type { SessionUser } from "@/lib/auth/types";

function applySidebarUserCard(
  user: Pick<SessionUser, "name" | "email">,
  photoUrl?: string,
) {
  const cards = document.querySelectorAll<HTMLElement>(
    ".user-card, #user-menu-toggle, button.user-card",
  );
  let found = false;

  cards.forEach((card) => {
    found = true;
    const strong = card.querySelector(".user-meta strong");
    const span = card.querySelector(".user-meta span");
    if (strong && user.name) strong.textContent = user.name;
    if (span && user.email) span.textContent = user.email;

    const avatar = card.querySelector<HTMLElement>(".user-avatar");
    if (!avatar) return;
    if (photoUrl) {
      avatar.style.backgroundImage = `url("${photoUrl}")`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
      avatar.style.backgroundRepeat = "no-repeat";
      avatar.classList.add("has-photo");
    } else {
      avatar.style.backgroundImage = "";
      avatar.classList.remove("has-photo");
    }
  });

  return found;
}

function AdminBridges() {
  return (
    <>
      <AdminLoginBridge />
      <Suspense fallback={null}>
        <AdminRegisterBridge />
        <AdminDataBridge />
        <AdminEventsTabsBridge />
        <AdminEventActionsBridge />
        <AdminOpsBridge />
        <AdminAiBridge />
        <AdminEventPhotosBridge />
      </Suspense>
    </>
  );
}

/** Mounts shared admin auth + live data bridges for all /admin pages. */
export function AdminAuthClient() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    try {
      if (user?.isAdmin) {
        localStorage.setItem(
          "dc_admin_role",
          user.role === "super-admin" ? "super-admin" : "admin",
        );
        document.body.classList.toggle(
          "is-super-admin",
          user.role === "super-admin",
        );
      }
    } catch {
      /* ignore */
    }
  }, [user, loading]);

  // Sidebar user card still ships with Figma placeholders — hydrate from session/DB.
  useEffect(() => {
    if (loading || !user?.isAdmin) return;

    let cancelled = false;
    let photoUrl = "";
    let displayName = user.name;
    let displayEmail = user.email;

    const apply = () => {
      if (cancelled) return;
      applySidebarUserCard(
        { name: displayName, email: displayEmail },
        photoUrl || undefined,
      );
    };

    apply();
    const t1 = window.setTimeout(apply, 80);
    const t2 = window.setTimeout(apply, 400);
    const t3 = window.setTimeout(apply, 1200);

    void (async () => {
      try {
        const res = await fetch("/api/user/profile", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          profile?: {
            fullName?: string;
            firstName?: string;
            lastName?: string;
            email?: string;
            photoUrl?: string;
          };
        };
        const profile = data.profile;
        if (!profile) return;

        displayName =
          profile.fullName?.trim() ||
          `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
          user.name;
        displayEmail = profile.email?.trim() || user.email;
        photoUrl = profile.photoUrl || "";
        apply();
      } catch {
        /* keep session values */
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [user, loading, pathname]);

  return <AdminBridges />;
}
