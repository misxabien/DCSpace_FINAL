"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const TAB_ROUTES: Record<string, string> = {
  pending: "/admin/event13",
  approved: "/admin/event13?tab=approved",
  ongoing: "/admin/ongoing16",
  completed: "/admin/complete18",
  inactive: "/admin/inactive20",
};

const TAB_LABELS: Record<string, string> = {
  pending: "Pending Approval",
  approved: "Approved Events",
  ongoing: "Ongoing Events",
  completed: "Completed Events",
  inactive: "Inactive Events",
};

function activeTabFromPath(pathname: string, tabParam: string | null, statusParam: string | null): string {
  if (pathname.includes("/admin/edetails14")) return "pending";
  if (pathname.includes("/admin/aed15")) return "approved";
  if (pathname.includes("/admin/live16") || statusParam === "live") return "ongoing";
  if (pathname.includes("/admin/cc19") || statusParam === "completed") return "completed";
  if (
    pathname.includes("/admin/rejected21") ||
    pathname.includes("/admin/postponed22") ||
    pathname.includes("/admin/c23") ||
    ["rejected", "postponed", "cancelled"].includes(statusParam || "")
  ) {
    return "inactive";
  }
  if (pathname.includes("/admin/ongoing16")) return "ongoing";
  if (pathname.includes("/admin/complete18")) return "completed";
  if (pathname.includes("/admin/inactive20")) return "inactive";
  if (pathname.includes("/admin/event13")) {
    return tabParam === "approved" ? "approved" : "pending";
  }
  return "";
}

function ensureEventTabs(root: ParentNode, active: string) {
  let tabs = root.querySelector<HTMLElement>(".event-tabs");
  if (!tabs) {
    const header = root.querySelector("main .topbar, main > header, .main > header");
    if (!header?.parentElement) return null;
    tabs = document.createElement("div");
    tabs.className = "event-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Event status");
    tabs.innerHTML = Object.entries(TAB_LABELS)
      .map(
        ([status, label]) =>
          `<button type="button" role="tab" aria-selected="false" data-status="${status}">${label}</button>`,
      )
      .join("");
    header.insertAdjacentElement("afterend", tabs);
  }

  tabs.querySelectorAll<HTMLButtonElement>("[data-status]").forEach((btn) => {
    const status = btn.getAttribute("data-status") || "";
    const isActive = status === active;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  return tabs;
}

function syncSubtitle(active: string) {
  let subtitle = document.getElementById("page-subtitle");
  if (!subtitle) {
    const titleWrap = document.querySelector(".page-title");
    if (!titleWrap) return;
    subtitle = document.createElement("p");
    subtitle.id = "page-subtitle";
    subtitle.className = "page-subtitle";
    titleWrap.appendChild(subtitle);
  }
  subtitle.hidden = false;
  subtitle.textContent = TAB_LABELS[active] || "Events";
}

/**
 * Keeps Events status tabs (Pending / Approved / Ongoing / Completed / Inactive)
 * visible and navigable across admin event list + detail pages.
 */
export function AdminEventsTabsBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const watch =
      pathname.startsWith("/admin/event13") ||
      pathname.startsWith("/admin/aed15") ||
      pathname.startsWith("/admin/ongoing16") ||
      pathname.startsWith("/admin/complete18") ||
      pathname.startsWith("/admin/inactive20") ||
      pathname.startsWith("/admin/edetails14") ||
      pathname.startsWith("/admin/live16") ||
      pathname.startsWith("/admin/cc19") ||
      pathname.startsWith("/admin/rejected21") ||
      pathname.startsWith("/admin/postponed22") ||
      pathname.startsWith("/admin/c23");
    if (!watch) return;

    const active = activeTabFromPath(
      pathname,
      searchParams.get("tab"),
      searchParams.get("status"),
    );

    const root =
      document.querySelector(".admin-legacy-root") ||
      document.querySelector("[data-admin-page]") ||
      document.body;

    const apply = () => {
      ensureEventTabs(root, active);
      syncSubtitle(active);
    };

    apply();
    const t1 = window.setTimeout(apply, 80);
    const t2 = window.setTimeout(apply, 300);
    const t3 = window.setTimeout(apply, 800);

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      const btn = target.closest<HTMLElement>("[data-status]");
      if (!btn || !btn.closest(".event-tabs")) return;

      const status = (btn.getAttribute("data-status") || "").trim();
      const href = TAB_ROUTES[status];
      if (!href) return;

      // Own the click so legacy inline tab scripts cannot send users to the wrong page.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const currentPath = window.location.pathname;
      const currentTab = new URLSearchParams(window.location.search).get("tab");
      const alreadyHere =
        (status === "pending" && currentPath.includes("/admin/event13") && currentTab !== "approved") ||
        (status === "approved" && currentPath.includes("/admin/event13") && currentTab === "approved") ||
        (status === "ongoing" && currentPath.includes("/admin/ongoing16")) ||
        (status === "completed" && currentPath.includes("/admin/complete18")) ||
        (status === "inactive" && currentPath.includes("/admin/inactive20"));

      if (alreadyHere) {
        ensureEventTabs(root, status);
        syncSubtitle(status);
        return;
      }
      window.location.assign(href);
    };

    // Capture phase + stopImmediatePropagation beats legacy bubble listeners.
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname, searchParams]);

  return null;
}
