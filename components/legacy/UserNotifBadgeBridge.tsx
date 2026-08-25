"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function notifBellTargets(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        'a.tool-btn--notif[href="/notifications"]',
        'a.tool-btn[href="/notifications"]',
        'a[href="/notifications"][aria-label*="Notification" i]',
        'a[href="/notifications"].tool-btn--notif',
      ].join(", "),
    ),
  );
}

function ensureUnreadDot(host: HTMLElement) {
  host.classList.add("tool-btn--notif");
  if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }
  let dot = host.querySelector<HTMLElement>(".notif-unread-dot");
  if (!dot) {
    dot = document.createElement("span");
    dot.className = "notif-unread-dot";
    dot.setAttribute("aria-hidden", "true");
    host.appendChild(dot);
  }
  return dot;
}

function setUserNotifBadge(unreadCount: number) {
  const hasUnread = unreadCount > 0;
  for (const el of notifBellTargets()) {
    el.classList.toggle("has-unread", hasUnread);
    const dot = ensureUnreadDot(el);
    dot.hidden = !hasUnread;
    if (hasUnread) {
      el.setAttribute("data-unread-count", String(unreadCount));
      el.setAttribute(
        "aria-label",
        unreadCount === 1
          ? "Notifications, 1 unread"
          : `Notifications, ${unreadCount} unread`,
      );
    } else {
      el.removeAttribute("data-unread-count");
      el.setAttribute("aria-label", "Notifications");
    }
  }
}

async function refreshUserNotifBadge() {
  try {
    const res = await fetch("/api/user/notifications?light=1", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { notifications?: Array<{ read: boolean }> };
    const unread = (data.notifications || []).filter((item) => !item.read).length;
    setUserNotifBadge(unread);
  } catch {
    /* ignore aborted/network errors (Safari "Load failed") */
  }
}

/**
 * Shows a red unread dot on the student/organizer notification bell
 * (same pattern as admin), for new events, status changes, certificates, etc.
 */
export function UserNotifBadgeBridge() {
  const pathname = usePathname();

  useEffect(() => {
    void refreshUserNotifBadge();
    const poll = window.setInterval(() => void refreshUserNotifBadge(), 12_000);
    const onFocus = () => void refreshUserNotifBadge();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshUserNotifBadge();
    };
    const onUpdated = () => void refreshUserNotifBadge();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("dcspace-profile-updated", onUpdated);
    window.addEventListener("dc-portal-invalidated", onUpdated);
    window.addEventListener("dc-notifications-rendered", onUpdated);

    // Re-scan after legacy HTML mounts / soft navigates.
    const t1 = window.setTimeout(() => void refreshUserNotifBadge(), 200);
    const t2 = window.setTimeout(() => void refreshUserNotifBadge(), 800);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("dcspace-profile-updated", onUpdated);
      window.removeEventListener("dc-portal-invalidated", onUpdated);
      window.removeEventListener("dc-notifications-rendered", onUpdated);
    };
  }, [pathname]);

  return null;
}
