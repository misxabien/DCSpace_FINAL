"use client";

import { useEffect } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { useLegacyScripts } from "@/components/legacy/useLegacyPage";

const SIDEBAR_STORAGE_KEY = "dc_admin_sidebar_collapsed";

/**
 * Renders a full admin HTML document body + styles with no AppShell wrapper,
 * so Figma/HTML designs stay visually identical.
 */
export function AdminLegacyPage({ data }: { data: LegacyPageData }) {
  useLegacyScripts(data.scripts);

  useEffect(() => {
    document.title = data.title || "DC Space Admin";
    document.documentElement.setAttribute("data-admin-legacy", "true");
    document.body.setAttribute("data-admin-legacy", "true");
    return () => {
      document.documentElement.removeAttribute("data-admin-legacy");
      document.body.removeAttribute("data-admin-legacy");
    };
  }, [data.title]);

  // Super Admin — show Administration nav (open + collapsed). Don't rely only on legacy scripts.
  useEffect(() => {
    const syncSuperAdminNav = () => {
      let role = "";
      try {
        role = localStorage.getItem("dc_admin_role") || "";
      } catch {
        /* ignore */
      }
      const isSuper = role === "super-admin";
      document.body.classList.toggle("is-super-admin", isSuper);
      document
        .querySelectorAll<HTMLElement>(".nav-super-only, .sa-only-row")
        .forEach((el) => {
          if (isSuper) {
            el.hidden = false;
            el.removeAttribute("hidden");
          } else {
            el.hidden = true;
            el.setAttribute("hidden", "");
          }
        });
    };

    syncSuperAdminNav();
    // Legacy scripts may race; re-sync shortly after mount / navigation.
    const t1 = window.setTimeout(syncSuperAdminNav, 0);
    const t2 = window.setTimeout(syncSuperAdminNav, 100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [data.id, data.route, data.title]);

  // Reliable sidebar collapse for all admin shell pages (persists across routes).
  useEffect(() => {
    const root = document.querySelector(".admin-legacy-root");
    if (!root) return;

    const setCollapsed = (collapsed: boolean) => {
      const app = document.getElementById("app");
      const toggle = document.getElementById("menu-toggle");
      const logo = document.getElementById("brand-logo");
      if (!app || !toggle) return;

      app.classList.toggle("sidebar-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute(
        "aria-label",
        collapsed ? "Expand sidebar" : "Collapse sidebar"
      );
      if (logo) {
        logo.setAttribute(
          "aria-label",
          collapsed ? "Expand sidebar" : "DC Space"
        );
      }
      try {
        localStorage.setItem(
          SIDEBAR_STORAGE_KEY,
          collapsed ? "true" : "false"
        );
      } catch {
        /* ignore */
      }
    };

    const restore = () => {
      try {
        if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true") {
          setCollapsed(true);
        }
      } catch {
        /* ignore */
      }
    };

    // Capture-phase handler wins over per-page legacy listeners (avoids double-toggle).
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const app = document.getElementById("app");
      if (!app) return;

      if (target.closest("#menu-toggle")) {
        event.preventDefault();
        event.stopPropagation();
        setCollapsed(!app.classList.contains("sidebar-collapsed"));
        return;
      }

      if (
        target.closest("#brand-logo") &&
        app.classList.contains("sidebar-collapsed")
      ) {
        event.preventDefault();
        event.stopPropagation();
        setCollapsed(false);
      }
    };

    restore();
    const restoreTimer = window.setTimeout(restore, 50);
    root.addEventListener("click", onClick, true);

    return () => {
      window.clearTimeout(restoreTimer);
      root.removeEventListener("click", onClick, true);
    };
  }, [data.id, data.route, data.title]);

  return (
    <div data-admin-legacy="" className="admin-legacy-root">
      <style dangerouslySetInnerHTML={{ __html: data.styles }} />
      {/* Loaded after page styles so Super Admin Administration stays visible when collapsed */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
body.is-super-admin .nav a.nav-super-only,
body.is-super-admin .app.sidebar-collapsed .nav a.nav-super-only,
body.is-super-admin .admin-legacy-root .app.sidebar-collapsed .nav a.nav-super-only {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}
body.is-super-admin .app.sidebar-collapsed .nav a.nav-super-only {
  width: 44px !important;
  height: 44px !important;
  min-height: 44px !important;
}
body.is-super-admin .app.sidebar-collapsed .nav a.nav-super-only svg {
  display: block !important;
  width: 22px !important;
  height: 22px !important;
  visibility: visible !important;
  opacity: 1 !important;
}

/* Make Admin: regular admin never sees it; Super Admin only */
.sa-only-row,
.action-row.sa-only-row,
.participant-actions .action-row.sa-only-row,
.sa-actions-card .action-row.sa-only-row {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
body.is-super-admin .sa-only-row,
body.is-super-admin .action-row.sa-only-row,
body.is-super-admin .participant-actions .action-row.sa-only-row,
body.is-super-admin .sa-actions-card .action-row.sa-only-row {
  display: flex !important;
  visibility: visible !important;
  pointer-events: auto !important;
  align-items: center !important;
  justify-content: space-between !important;
}
`,
        }}
      />
      <div dangerouslySetInnerHTML={{ __html: data.html }} />
    </div>
  );
}
