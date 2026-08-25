"use client";

import { useEffect } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { useLegacyScripts } from "@/components/legacy/useLegacyPage";
import { bindPasswordToggles } from "@/components/legacy/bindPasswordToggles";
import {
  FILTER_DROPDOWN_PAGES,
  bindAdminFilterDropdowns,
} from "@/components/legacy/bindAdminFilterDropdowns";

const SIDEBAR_STORAGE_KEY = "dc_admin_sidebar_collapsed";

/** Keep SSR/client markup identical (Windows JSON often has CRLF). */
function normalizeLegacyMarkup(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Renders a full admin HTML document body + styles with no AppShell wrapper,
 * so Figma/HTML designs stay visually identical.
 */
export function AdminLegacyPage({ data }: { data: LegacyPageData }) {
  useLegacyScripts(data.scripts, data.id);
  const pageStyles = normalizeLegacyMarkup(data.styles);
  const pageHtml = normalizeLegacyMarkup(data.html);

  useEffect(() => {
    document.title = data.title || "DC Space Admin";
    document.documentElement.setAttribute("data-admin-legacy", "true");
    document.body.setAttribute("data-admin-legacy", "true");
    return () => {
      document.documentElement.removeAttribute("data-admin-legacy");
      document.body.removeAttribute("data-admin-legacy");
    };
  }, [data.title]);

  // Password show/hide (eye icon) — event delegation survives HTML remounts
  useEffect(() => {
    const root = document.querySelector(".admin-legacy-root");
    if (!root) return;
    return bindPasswordToggles(root);
  }, [data.id, data.route]);

  // Select Date / Org / Course — React-bound with cleanup (avoids stacked legacy listeners)
  useEffect(() => {
    const prefix = FILTER_DROPDOWN_PAGES[data.id];
    if (!prefix) return;
    const root = document.querySelector(".admin-legacy-root");
    if (!root) return;
    return bindAdminFilterDropdowns(root, prefix);
  }, [data.id, data.route, data.html]);

  // Profile banner — Super Admin: role label + hide Approved By
  useEffect(() => {
    if (data.id !== "profile") return;
    let role = "admin";
    try {
      role = localStorage.getItem("dc_admin_role") || "admin";
    } catch {
      /* ignore */
    }
    const isSuper = role === "super-admin";
    const roleEl = document.getElementById("profile-account-role");
    const approvedLabel = document.getElementById("profile-approved-by-label");
    const approvedValue = document.getElementById("profile-approved-by-value");
    if (roleEl) roleEl.textContent = isSuper ? "Super Admin" : "Admin";
    [approvedLabel, approvedValue].forEach((el) => {
      if (!el) return;
      el.hidden = isSuper;
      el.style.display = isSuper ? "none" : "";
    });
  }, [data.id, data.route, data.html]);

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

  // Admin Notes Resolve / Resolved pills — work on every event details page
  useEffect(() => {
    const root = document.querySelector(".admin-legacy-root");
    if (!root) return;

    const upgradePills = () => {
      root.querySelectorAll("span.status-pill").forEach((span) => {
        const text = (span.textContent || "").trim();
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "status-pill";
        if (/^resolved$/i.test(text)) {
          btn.classList.add("is-resolved");
          btn.textContent = "Resolved";
          btn.setAttribute("aria-pressed", "true");
        } else {
          btn.classList.add("is-resolve");
          btn.textContent = text || "Resolve";
          btn.setAttribute("aria-pressed", "false");
        }
        span.replaceWith(btn);
      });

      root.querySelectorAll("button.status-pill").forEach((btn) => {
        const el = btn as HTMLButtonElement;
        const text = (el.textContent || "").trim();
        if (
          !el.classList.contains("is-resolve") &&
          !el.classList.contains("is-resolved")
        ) {
          if (/^resolved$/i.test(text)) {
            el.classList.add("is-resolved");
            el.setAttribute("aria-pressed", "true");
          } else {
            el.classList.add("is-resolve");
            el.setAttribute("aria-pressed", "false");
          }
        }
      });
    };

    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest("button.status-pill") as HTMLButtonElement | null;
      if (!btn || !root.contains(btn)) return;
      // Only note-card status pills (not unrelated pills)
      if (!btn.closest(".note-card, .notes-panel")) return;

      event.preventDefault();
      event.stopPropagation();

      const resolved = btn.classList.contains("is-resolved");
      if (resolved) {
        btn.classList.remove("is-resolved");
        btn.classList.add("is-resolve");
        btn.textContent = "Resolve";
        btn.setAttribute("aria-pressed", "false");
      } else {
        btn.classList.remove("is-resolve");
        btn.classList.add("is-resolved");
        btn.textContent = "Resolved";
        btn.setAttribute("aria-pressed", "true");
      }
    };

    upgradePills();
    const t1 = window.setTimeout(upgradePills, 0);
    const t2 = window.setTimeout(upgradePills, 100);
    root.addEventListener("click", onClick, true);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      root.removeEventListener("click", onClick, true);
    };
  }, [data.id, data.route, data.title]);

  return (
    <div data-admin-legacy="" data-admin-page={data.id} className="admin-legacy-root">
      <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
      {/* Loaded after page styles so Super Admin Administration stays visible when collapsed */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
/* register03 + school04 — shared signup form sizing */
[data-admin-page="register03"] .page,
[data-admin-page="school04"] .page {
  grid-template-columns: minmax(280px, 38.177%) 1fr !important;
}
[data-admin-page="register03"] .panel,
[data-admin-page="school04"] .panel {
  padding: 4.5vh 4vw 4vh !important;
}
[data-admin-page="register03"] .panel .form,
[data-admin-page="school04"] .panel .form,
[data-admin-page="register03"] .panel .field,
[data-admin-page="school04"] .panel .field,
[data-admin-page="register03"] .panel .actions,
[data-admin-page="school04"] .panel .actions {
  width: 100% !important;
  max-width: 720px !important;
}
[data-admin-page="register03"] .panel .field input,
[data-admin-page="register03"] .panel .field select,
[data-admin-page="school04"] .panel .field input,
[data-admin-page="school04"] .panel .field select {
  width: 100% !important;
  max-width: 720px !important;
  height: 44px !important;
  min-height: 44px !important;
  max-height: 44px !important;
  padding: 0 14px !important;
  font-size: 14px !important;
  border-radius: 6px !important;
  box-sizing: border-box !important;
}
[data-admin-page="register03"] .panel h2,
[data-admin-page="school04"] .panel h2 {
  font-size: 28px !important;
  margin: 0 0 28px !important;
}

/* Label → input breathing room on signup steps */
[data-admin-page="register03"] .panel .field,
[data-admin-page="school04"] .panel .field,
[data-admin-page="acc05"] .panel .field,
[data-admin-page="verify06"] .panel .field {
  gap: 12px !important;
}

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

/* Shared topbar: compact title, bottom rule, aligned actions */
[data-admin-legacy] .topbar {
  border-bottom: 1px solid rgba(68, 138, 255, 0.14) !important;
  padding: 22px 0 16px !important;
  margin-bottom: 16px !important;
  align-items: center !important;
}
[data-admin-legacy] .topbar .welcome p,
[data-admin-legacy] .page-title h1,
[data-admin-legacy] .page-heading h1,
[data-admin-legacy] .page-heading-row .texts h1,
[data-admin-legacy] h1.page-title,
[data-admin-legacy] .page-title {
  font-family: "Poppins", sans-serif !important;
  font-size: 24px !important;
  line-height: 1.25 !important;
  font-weight: 600 !important;
  letter-spacing: -0.02em !important;
  color: #448AFF !important;
}
[data-admin-legacy] .topbar .page-title,
[data-admin-legacy] .topbar .page-title h1,
[data-admin-legacy] .topbar .welcome,
[data-admin-legacy] .topbar .welcome p {
  margin: 0 !important;
}
[data-admin-legacy] .topbar .back-row {
  display: flex !important;
  align-items: flex-start !important;
  gap: 10px !important;
}
[data-admin-legacy] .topbar .back-btn {
  display: inline-grid !important;
  place-items: center !important;
  width: 36px !important;
  height: 36px !important;
  flex-shrink: 0 !important;
  visibility: visible !important;
  opacity: 1 !important;
  text-decoration: none !important;
}
[data-admin-legacy] .topbar .back-btn svg {
  width: 26px !important;
  height: 26px !important;
  display: block !important;
}

/* certdeets46 header — Figma: chevron + Certificates / Events */
[data-admin-legacy] .cd-page-heading,
[data-admin-legacy] .page-heading.cd-page-heading {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start !important;
  gap: 10px !important;
}
[data-admin-legacy] .cd-page-heading .back-btn {
  display: inline-grid !important;
  place-items: center !important;
  width: 36px !important;
  height: 36px !important;
  margin-top: 2px !important;
  flex-shrink: 0 !important;
  color: #448AFF !important;
  text-decoration: none !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
[data-admin-legacy] .cd-page-heading .back-btn svg {
  width: 28px !important;
  height: 28px !important;
}
[data-admin-legacy] .cd-page-heading .texts {
  display: flex !important;
  flex-direction: column !important;
  gap: 0 !important;
}
[data-admin-legacy] .cd-page-heading .texts h1,
[data-admin-legacy] .cd-page-heading h1 {
  margin: 0 !important;
  font-size: 28px !important;
  font-weight: 700 !important;
  line-height: 1.15 !important;
  color: #448AFF !important;
}
[data-admin-legacy] .cd-page-heading .texts p,
[data-admin-legacy] .cd-page-heading p {
  margin: 2px 0 0 !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  line-height: 1.3 !important;
  color: #448AFF !important;
}

/* fcollection48 + feeddeets49 + scollection48 header — Figma: chevron + Feedback / subtitle */
[data-admin-legacy][data-admin-page="fcollection48"] .fb-page-heading,
[data-admin-legacy][data-admin-page="feeddeets49"] .fb-page-heading,
[data-admin-legacy][data-admin-page="scollection48"] .fb-page-heading,
[data-admin-legacy] .page-heading.fb-page-heading {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start !important;
  gap: 10px !important;
}
[data-admin-legacy][data-admin-page="fcollection48"] .fb-page-heading .back-btn,
[data-admin-legacy][data-admin-page="feeddeets49"] .fb-page-heading .back-btn,
[data-admin-legacy][data-admin-page="scollection48"] .fb-page-heading .back-btn,
[data-admin-legacy] .page-heading.fb-page-heading .back-btn {
  display: inline-grid !important;
  place-items: center !important;
  width: 36px !important;
  height: 36px !important;
  margin-top: 2px !important;
  flex-shrink: 0 !important;
  color: #448AFF !important;
  text-decoration: none !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
[data-admin-legacy][data-admin-page="fcollection48"] .fb-page-heading .back-btn svg,
[data-admin-legacy][data-admin-page="feeddeets49"] .fb-page-heading .back-btn svg,
[data-admin-legacy][data-admin-page="scollection48"] .fb-page-heading .back-btn svg,
[data-admin-legacy] .page-heading.fb-page-heading .back-btn svg {
  width: 28px !important;
  height: 28px !important;
}
[data-admin-legacy][data-admin-page="fcollection48"] .fb-page-heading .texts,
[data-admin-legacy][data-admin-page="feeddeets49"] .fb-page-heading .texts,
[data-admin-legacy][data-admin-page="scollection48"] .fb-page-heading .texts,
[data-admin-legacy] .page-heading.fb-page-heading .texts {
  display: flex !important;
  flex-direction: column !important;
  gap: 0 !important;
}
[data-admin-legacy][data-admin-page="fcollection48"] .fb-page-heading .texts h1,
[data-admin-legacy][data-admin-page="feeddeets49"] .fb-page-heading .texts h1,
[data-admin-legacy][data-admin-page="scollection48"] .fb-page-heading .texts h1,
[data-admin-legacy] .page-heading.fb-page-heading .texts h1 {
  margin: 0 !important;
  font-size: 28px !important;
  font-weight: 700 !important;
  line-height: 1.15 !important;
  color: #448AFF !important;
}
[data-admin-legacy][data-admin-page="fcollection48"] .fb-page-heading .texts p,
[data-admin-legacy][data-admin-page="feeddeets49"] .fb-page-heading .texts p,
[data-admin-legacy][data-admin-page="scollection48"] .fb-page-heading .texts p,
[data-admin-legacy] .page-heading.fb-page-heading .texts p {
  margin: 2px 0 0 !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  line-height: 1.3 !important;
  color: #448AFF !important;
}
[data-admin-legacy][data-admin-page="fcollection48"] .fc-head .fb-title,
[data-admin-legacy][data-admin-page="fcollection48"] h2.fb-title,
[data-admin-legacy][data-admin-page="scollection48"] .fc-head .fb-title,
[data-admin-legacy][data-admin-page="scollection48"] h2.fb-title {
  color: #000000 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] h2.fb-title,
[data-admin-legacy][data-admin-page="feedback47"] .fb-title,
[data-admin-legacy][data-admin-page="feedback47"] .fb-title.under,
[data-admin-legacy][data-admin-page="feedback47"] .fb-title a,
[data-admin-legacy][data-admin-page="feedback47"] .fb-title.under a {
  color: #000000 !important;
  text-shadow: none !important;
}

/* certdeets46: hide filter chips; section search = dashboard search-bar */
[data-admin-legacy] .cd-chips,
[data-admin-legacy] .cd-chip {
  display: none !important;
}
[data-admin-legacy] .cd-section-head .search-bar,
[data-admin-legacy] .search-bar.cd-section-search {
  display: inline-flex !important;
  align-items: center !important;
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  width: min(360px, 42vw) !important;
  padding: 0 8px 0 12px !important;
  gap: 8px !important;
  border: 1px solid rgba(68, 138, 255, 0.22) !important;
  box-shadow: 0 4px 14px rgba(68, 138, 255, 0.12) !important;
  border-radius: 999px !important;
  background: #fff !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}
[data-admin-legacy] .cd-section-head .search-bar > svg,
[data-admin-legacy] .search-bar.cd-section-search > svg {
  width: 16px !important;
  height: 16px !important;
}
[data-admin-legacy] .cd-section-head .search-bar input,
[data-admin-legacy] .search-bar.cd-section-search input {
  font-size: 13px !important;
  color: #64748b !important;
  border: 0 !important;
  background: transparent !important;
  padding: 0 !important;
}

/* certdeets46: Asc/Desc + Show entries — always at bottom of list card */
[data-admin-legacy][data-admin-page="certdeets46"] .cd-panel {
  display: flex !important;
  flex-direction: column !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-panel > .cd-event,
[data-admin-legacy][data-admin-page="certdeets46"] .cd-panel > a.cd-event,
[data-admin-legacy][data-admin-page="certdeets46"] .cd-panel > hr.cd-divider {
  order: 0;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-panel > .dc-events-empty {
  order: 1;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-footer {
  order: 2 !important;
  margin-top: auto !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
  width: 100% !important;
  padding-top: 12px !important;
  border-top: 1px solid rgba(68, 138, 255, 0.14) !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-sort {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  height: auto !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-sort button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 12px !important;
  background: #ffffff !important;
  border: 1px solid #448aff !important;
  border-radius: 6px !important;
  color: #448aff !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  cursor: pointer !important;
  box-shadow: none !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-sort button svg {
  width: 14px !important;
  height: 14px !important;
  flex-shrink: 0 !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-sort button.active,
[data-admin-legacy][data-admin-page="certdeets46"] .cd-sort button:hover {
  background: #ffffff !important;
  border-color: #448aff !important;
  color: #448aff !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-pager {
  display: inline-flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 12px !important;
  margin-left: auto !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-show {
  display: inline !important;
  margin: 0 !important;
  padding: 0 !important;
  gap: 0 !important;
  color: #448aff !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
  background: none !important;
  border: none !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-page {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin-left: 0 !important;
  color: #448aff !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-page .nav-btn {
  display: inline-grid !important;
  place-items: center !important;
  width: 32px !important;
  height: 32px !important;
  min-width: 32px !important;
  padding: 0 !important;
  background: #ffffff !important;
  border: 1.5px solid #448aff !important;
  border-radius: 6px !important;
  color: #448aff !important;
  font-size: 18px !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  cursor: pointer !important;
  box-shadow: none !important;
}
[data-admin-legacy][data-admin-page="certdeets46"] .cd-page .nav-btn:hover {
  background: #f3f8ff !important;
}

/* certdeets46 section titles — black */
[data-admin-legacy] .cd-section-title {
  color: #000000 !important;
}

/* fulld46: Certificate Processing Progress + Certificate Overview — Figma */
[data-admin-legacy] .fd-mid {
  display: grid !important;
  grid-template-columns: minmax(0, 1.95fr) minmax(0, 1fr) !important;
  gap: 20px !important;
  margin-bottom: 24px !important;
  align-items: stretch !important;
}
[data-admin-legacy] .fd-mid > .fd-panel {
  display: flex !important;
  flex-direction: column !important;
  padding: 20px 22px 24px !important;
  margin-bottom: 0 !important;
  border: 1px solid rgba(68, 138, 255, 0.18) !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 18px rgba(68, 138, 255, 0.12) !important;
  background: #fff !important;
  min-height: 0 !important;
  height: 100% !important;
}
[data-admin-legacy] .fd-mid > .fd-panel > h3 {
  font-family: "Poppins", sans-serif !important;
  font-size: 22px !important;
  font-weight: 650 !important;
  letter-spacing: -0.03em !important;
  line-height: 1.2 !important;
  color: #448AFF !important;
  margin: 0 0 16px !important;
  text-transform: none !important;
  text-shadow: none !important;
}
[data-admin-legacy] #event-info .fd-section-head h2,
[data-admin-legacy] .fd-section-head h2 {
  font-family: "Poppins", sans-serif !important;
  font-size: 22px !important;
  font-weight: 650 !important;
  letter-spacing: -0.03em !important;
  line-height: 1.2 !important;
  color: #000000 !important;
  text-shadow: none !important;
}
[data-admin-legacy] .fd-rings {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 22px 16px !important;
}
[data-admin-legacy] .fd-ring-item {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  text-align: center !important;
  gap: 8px !important;
}
[data-admin-legacy] .fd-ring-item .name {
  font-size: 15px !important;
  font-weight: 500 !important;
  color: #433d4b !important;
  min-height: 36px !important;
}
[data-admin-legacy] .fd-ring {
  width: 120px !important;
  height: 120px !important;
  border-radius: 50% !important;
  background: conic-gradient(#448aff 0 21%, #b2cfff 21% 100%) !important;
  display: grid !important;
  place-items: center !important;
  position: relative !important;
}
[data-admin-legacy] .fd-ring::before {
  content: "" !important;
  position: absolute !important;
  inset: 16px !important;
  width: auto !important;
  height: auto !important;
  border-radius: 50% !important;
  background: #fff !important;
}
[data-admin-legacy] .fd-ring span {
  position: relative !important;
  z-index: 1 !important;
  font-size: 20px !important;
  font-weight: 700 !important;
  color: #448aff !important;
}
[data-admin-legacy] .fd-ring-item .note {
  font-size: 12px !important;
  color: #1e1e1e !important;
  max-width: 240px !important;
  line-height: 1.4 !important;
}
[data-admin-legacy] .fd-overview {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  justify-content: space-between !important;
  gap: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  padding-top: 4px !important;
}
[data-admin-legacy] .fd-overview-row {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  flex: 1 1 auto !important;
  min-height: 56px !important;
  padding: 14px 0 !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  border-bottom: 1px solid rgba(68, 138, 255, 0.1) !important;
}
[data-admin-legacy] .fd-overview-row:last-child {
  border-bottom: none !important;
}
[data-admin-legacy] .fd-overview-row .k {
  color: #433d4b !important;
}
[data-admin-legacy] .fd-overview-row .v {
  color: #448aff !important;
  font-weight: 650 !important;
}
@media (max-width: 1100px) {
  [data-admin-legacy] .fd-mid {
    grid-template-columns: 1fr !important;
  }
}

/* fulld46 Event Information card — Figma */
[data-admin-legacy] #event-info .fd-card-top h3 {
  color: #448AFF !important;
  font-size: 22px !important;
  font-weight: 700 !important;
}
[data-admin-legacy] #event-info .fd-card-top .desc {
  color: #0f172a !important;
  font-size: 14px !important;
}
[data-admin-legacy] #event-info .fd-status-label {
  color: #448AFF !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
}
[data-admin-legacy] #event-info .fd-block-title {
  color: #0f172a !important;
  font-size: 16px !important;
  font-weight: 700 !important;
}
[data-admin-legacy] #event-info .fd-fields {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 12px !important;
}
[data-admin-legacy] #event-info .fd-field {
  min-height: 88px !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  border-radius: 10px !important;
  background: #fff !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-legacy] #event-info .fd-field .label {
  color: #94a3b8 !important;
  text-align: left !important;
}
[data-admin-legacy] #event-info .fd-field .value {
  color: #0f172a !important;
  font-weight: 700 !important;
  text-align: center !important;
}
[data-admin-legacy] #event-info .fd-file {
  background: #e8f1ff !important;
  border: none !important;
  border-radius: 12px !important;
  width: 150px !important;
}
[data-admin-legacy] #event-info .fd-file svg path {
  fill: #448AFF !important;
}
[data-admin-legacy] #event-info .fd-file strong {
  color: #0f172a !important;
}
[data-admin-legacy] #event-info .fd-file span {
  color: #64748b !important;
}

/* fulld46 Participants Eligible — spacing + no inner scroll */
[data-admin-legacy] .fd-part {
  padding: 20px 22px 24px !important;
  border: 1px solid rgba(68, 138, 255, 0.18) !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 18px rgba(68, 138, 255, 0.12) !important;
  background: #fff !important;
  overflow: visible !important;
}
[data-admin-legacy] .fd-part-head {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
  margin-bottom: 14px !important;
}
[data-admin-legacy] .fd-part-head h3 {
  font-family: "Poppins", sans-serif !important;
  font-size: 22px !important;
  font-weight: 650 !important;
  letter-spacing: -0.03em !important;
  color: #448AFF !important;
  margin: 0 !important;
  text-shadow: none !important;
}
[data-admin-legacy] .fd-table-wrap {
  overflow: visible !important;
  max-height: none !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
}
[data-admin-legacy] .fd-table {
  width: 100% !important;
  min-width: 0 !important;
  table-layout: fixed !important;
}
[data-admin-legacy] .fd-table thead th,
[data-admin-legacy] .fd-table tbody td {
  padding: 10px 8px !important;
  white-space: normal !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
}
[data-admin-legacy] .fd-table thead th:nth-child(8),
[data-admin-legacy] .fd-table tbody td:nth-child(8) {
  width: 118px !important;
  white-space: nowrap !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
}
[data-admin-legacy] .fd-table thead th {
  color: #1357C9 !important;
  font-size: 11px !important;
  line-height: 1.25 !important;
}
[data-admin-legacy] .fd-table tbody td {
  font-size: 13px !important;
  line-height: 1.3 !important;
}
[data-admin-legacy] .fd-table tbody td:nth-child(2) {
  min-width: 0 !important;
}
[data-admin-legacy] .fd-action {
  display: inline-flex !important;
  width: auto !important;
}
[data-admin-legacy] .fd-action > button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 26px !important;
  min-width: 104px !important;
  width: auto !important;
  max-width: none !important;
  padding: 0 8px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  gap: 4px !important;
  white-space: nowrap !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
  line-height: 1 !important;
  border-radius: 7px !important;
}
[data-admin-legacy] .fd-action > button svg {
  flex-shrink: 0 !important;
  width: 10px !important;
  height: 10px !important;
}

/* fulld46 table checkboxes + footer spacing */
[data-admin-legacy] .fd-table input[type="checkbox"] {
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
  margin: 0 !important;
  accent-color: #448aff !important;
  cursor: pointer !important;
}
[data-admin-legacy] .fd-table thead th:nth-child(1),
[data-admin-legacy] .fd-table tbody td:nth-child(1) {
  width: 36px !important;
  text-align: center !important;
  vertical-align: middle !important;
}
[data-admin-legacy] .fd-footer {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  margin-top: 12px !important;
}
[data-admin-legacy] .fd-show {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  margin-left: auto !important;
}
[data-admin-legacy] .fd-page {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  margin-left: 0 !important;
}

/* feedback47: no hover on overview stat boxes */
[data-admin-legacy] .fb-stats .fb-stat,
[data-admin-legacy] .fb-stats .fb-stat:hover,
[data-admin-legacy] .fb-stats .fb-stat:hover * {
  transform: none !important;
  transition: none !important;
  filter: none !important;
  cursor: default !important;
}
[data-admin-legacy] .fb-stats .fb-stat,
[data-admin-legacy] .fb-stats .fb-stat:hover {
  border-color: rgba(68, 138, 255, 0.14) !important;
  box-shadow: 0 4px 16px rgba(68, 138, 255, 0.08) !important;
}
[data-admin-legacy] .fb-stats .fb-stat-head,
[data-admin-legacy] .fb-stats .fb-stat:hover .fb-stat-head {
  background: linear-gradient(90deg, #8eb6ff 0%, #448aff 100%) !important;
  filter: none !important;
  opacity: 1 !important;
  transform: none !important;
  box-shadow: none !important;
}
[data-admin-legacy] .fb-stats .fb-stat-head span,
[data-admin-legacy] .fb-stats .fb-stat:hover .fb-stat-head span {
  color: #ffffff !important;
  text-shadow: none !important;
  opacity: 1 !important;
  transform: none !important;
  filter: none !important;
}
[data-admin-legacy] .fb-stats .fb-stat-body,
[data-admin-legacy] .fb-stats .fb-stat:hover .fb-stat-body {
  background: #fff !important;
  transform: none !important;
  filter: none !important;
}

/* reportgen53: keep Show entries next to Page */
[data-admin-legacy] .rg-footer {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
}
[data-admin-legacy] .rg-show {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  margin-left: auto !important;
}
[data-admin-legacy] .rg-page {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
}

/* reportgen53: solid blue thumbs, no white inset */
[data-admin-legacy] .rg-thumb {
  box-shadow: none !important;
  background: linear-gradient(135deg, #7eb6ff, #448aff 45%, #3476e3) !important;
}
[data-admin-legacy] .rg-thumb-inner,
[data-admin-legacy] .rg-event.selected .rg-thumb-inner {
  display: none !important;
}
[data-admin-legacy] .rg-event-meta h3,
[data-admin-legacy] .rg-event-meta p {
  color: #1357C9 !important;
}

/* report2.54: Available Report Types — match Completed Events (reportgen53) */
[data-admin-legacy][data-admin-page="report2.54"] .rg-types-title,
[data-admin-legacy][data-admin-page="report2.54"] h2.rg-types-title {
  color: #000000 !important;
  font-size: var(--font-xl) !important;
  font-weight: 700 !important;
  letter-spacing: -0.02em !important;
  text-shadow: none !important;
}

/* report2.54: Figma flat radio choices */
[data-admin-legacy][data-admin-page="report2.54"] .rg-types {
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  max-width: 480px !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 0 0 12px !important;
}
[data-admin-legacy][data-admin-page="report2.54"] .rg-type {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  padding: 2px 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  transform: none !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  color: #1a1a1a !important;
}
[data-admin-legacy][data-admin-page="report2.54"] .rg-type:hover {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-legacy][data-admin-page="report2.54"] .rg-radio {
  width: 20px !important;
  height: 20px !important;
  border-radius: 50% !important;
  border: 2px solid #448AFF !important;
  background: transparent !important;
  box-shadow: none !important;
}
[data-admin-legacy][data-admin-page="report2.54"] .rg-type input:checked + .rg-radio {
  border-color: #448AFF !important;
  background: transparent !important;
}
[data-admin-legacy][data-admin-page="report2.54"] .rg-type input:checked + .rg-radio::after {
  content: "" !important;
  width: 10px !important;
  height: 10px !important;
  border-radius: 50% !important;
  background: #448AFF !important;
}
[data-admin-legacy][data-admin-page="report2.54"] .rg-type em {
  font-style: italic !important;
  color: inherit !important;
}

/* report3.55: Available Sections title */
[data-admin-legacy][data-admin-page="report3.55"] .rg-sections-head {
  padding-left: 12px !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-sections-head h2 {
  color: #000000 !important;
  font-size: 20px !important;
  font-weight: 700 !important;
  letter-spacing: -0.02em !important;
  text-shadow: none !important;
}

/* report3.55: Figma flat section checkboxes */
[data-admin-legacy][data-admin-page="report3.55"] .rg-sections {
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  max-width: 520px !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 0 0 24px !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-section {
  display: flex !important;
  align-items: center !important;
  gap: 16px !important;
  padding: 2px 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  transform: none !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  color: #334155 !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-section:hover {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-check {
  width: 20px !important;
  height: 20px !important;
  border-radius: 5px !important;
  border: 2px solid #8EB6FF !important;
  background: #ffffff !important;
  color: transparent !important;
  display: grid !important;
  place-items: center !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-check svg {
  width: 12px !important;
  height: 12px !important;
  opacity: 0 !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-section input:checked + .rg-check {
  background: #448AFF !important;
  border-color: #448AFF !important;
  color: #ffffff !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-section input:checked + .rg-check svg {
  opacity: 1 !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-section input:checked + .rg-check svg path {
  stroke: #ffffff !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-others-row {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 10px !important;
  width: 100% !important;
  max-width: 560px !important;
  padding: 2px 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-others-row > .rg-section {
  display: inline-flex !important;
  flex: 0 0 auto !important;
  width: auto !important;
  max-width: none !important;
  gap: 16px !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-others-row .rg-others-field,
[data-admin-legacy][data-admin-page="report3.55"] .rg-others-row .rg-others-field:disabled {
  flex: 1 1 auto !important;
  width: auto !important;
  min-width: 160px !important;
  max-width: 360px !important;
  height: 22px !important;
  border: none !important;
  border-bottom: 1.5px solid #64748b !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  opacity: 1 !important;
  cursor: text !important;
  padding: 0 2px !important;
  font-size: 15px !important;
  color: #334155 !important;
}
[data-admin-legacy][data-admin-page="report3.55"] .rg-others-row .rg-others-field:focus {
  border-bottom-color: #448AFF !important;
}

/* report4.56: module titles black + slightly larger */
[data-admin-legacy][data-admin-page="report4.56"] .rg-module-title {
  color: #000000 !important;
  font-size: 20px !important;
  font-weight: 700 !important;
  letter-spacing: -0.02em !important;
  text-shadow: none !important;
}

/* report4.56: card text size + spacing */
[data-admin-legacy][data-admin-page="report4.56"] .rg-card {
  padding: 16px 18px 18px !important;
}
[data-admin-legacy][data-admin-page="report4.56"] .rg-card h3,
[data-admin-legacy][data-admin-page="report4.56"] .rg-card h3.section-label {
  font-size: 15px !important;
  margin: 14px 0 10px !important;
  line-height: 1.35 !important;
}
[data-admin-legacy][data-admin-page="report4.56"] .rg-card h3:first-child,
[data-admin-legacy][data-admin-page="report4.56"] .rg-card h3.section-label:first-child {
  margin-top: 0 !important;
}
[data-admin-legacy][data-admin-page="report4.56"] .rg-kv {
  display: grid !important;
  grid-template-columns: minmax(0, 1.5fr) minmax(100px, 0.5fr) !important;
  gap: 12px 24px !important;
  align-items: center !important;
}
[data-admin-legacy][data-admin-page="report4.56"] .rg-kv .k,
[data-admin-legacy][data-admin-page="report4.56"] .rg-kv .v {
  font-size: 15px !important;
  font-weight: 600 !important;
  line-height: 1.45 !important;
}
[data-admin-legacy][data-admin-page="report4.56"] .rg-subhead {
  font-size: 15px !important;
  margin: 16px 0 10px !important;
}
[data-admin-legacy][data-admin-page="report4.56"] .rg-text-box {
  padding: 14px 16px !important;
  margin-bottom: 4px !important;
}
[data-admin-legacy][data-admin-page="report4.56"] .rg-text-box p {
  font-size: 14px !important;
  line-height: 1.55 !important;
}
[data-admin-legacy][data-admin-page="report4.56"] .rg-committee {
  font-size: 15px !important;
  line-height: 1.65 !important;
  margin-top: 6px !important;
}

/* report wizard: arrow inside gray continue circle */
[data-admin-legacy] .rg-step-arrow {
  display: none !important;
}
[data-admin-legacy] .rg-step.rg-step-continue,
[data-admin-legacy] .rg-step[aria-label="Continue"] {
  display: grid !important;
  place-items: center !important;
  width: 36px !important;
  height: 36px !important;
  border: 2px solid #cbd5e1 !important;
  background: #fff !important;
  color: #94a3b8 !important;
  box-shadow: none !important;
  padding: 0 !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease !important;
}
[data-admin-legacy] .rg-step.rg-step-continue svg,
[data-admin-legacy] .rg-step[aria-label="Continue"] svg {
  width: 16px !important;
  height: 16px !important;
  display: block !important;
  transition: transform 0.15s ease !important;
}
[data-admin-legacy] .rg-step.rg-step-continue:hover,
[data-admin-legacy] .rg-step[aria-label="Continue"]:hover {
  background: #448AFF !important;
  border-color: #448AFF !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(68, 138, 255, 0.28) !important;
}
[data-admin-legacy] .rg-step.rg-step-continue:hover svg,
[data-admin-legacy] .rg-step[aria-label="Continue"]:hover svg {
  transform: translateX(1px) !important;
}

/* report5.57: Ready to Generate — black + nudge right */
[data-admin-legacy][data-admin-page="report5.57"] #state-ready {
  padding-left: 16px !important;
}
[data-admin-legacy][data-admin-page="report5.57"] .rg-ready-title,
[data-admin-legacy][data-admin-page="report5.57"] .rg-ready-done-title {
  color: #000000 !important;
  text-shadow: none !important;
}
[data-admin-legacy][data-admin-page="report5.57"] .rg-panel-5 h2 {
  color: #448AFF !important;
  text-shadow: none !important;
}
[data-admin-legacy][data-admin-page="report5.57"] .rg-panel-5 {
  padding-left: calc(22px + 8px) !important;
}

/* report6.58: edit section titles black + slightly larger */
[data-admin-legacy][data-admin-page="report6.58"] .rg-edit-block > h3,
[data-admin-legacy][data-admin-page="report7.59"] .rg-edit-block > h3 {
  color: #000000 !important;
  font-size: 17px !important;
  font-weight: 650 !important;
  text-shadow: none !important;
}

/* report7.59: preview section titles black + slightly larger */
[data-admin-legacy][data-admin-page="report7.59"] .rg-preview-doc h3 {
  color: #000000 !important;
  font-size: 17px !important;
  font-weight: 700 !important;
  text-shadow: none !important;
}

/* report8.60: export formats — Figma cards + black title */
[data-admin-legacy][data-admin-page="report8.60"] .rg-export-title {
  color: #000000 !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  text-shadow: none !important;
}
[data-admin-legacy][data-admin-page="report8.60"] .rg-formats {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 168px)) !important;
  gap: 20px !important;
  margin: 0 0 28px !important;
  justify-content: start !important;
}
[data-admin-legacy][data-admin-page="report8.60"] .rg-format {
  width: 168px !important;
  height: 168px !important;
  border: 2px solid #448AFF !important;
  border-radius: 24px !important;
  background: #fff !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 12px !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-legacy][data-admin-page="report8.60"] .rg-format:hover,
[data-admin-legacy][data-admin-page="report8.60"] .rg-format.selected,
[data-admin-legacy][data-admin-page="report8.60"] .rg-format[aria-pressed="true"] {
  background: #448AFF !important;
  border-color: #448AFF !important;
  box-shadow: 0 8px 22px rgba(68, 138, 255, 0.32) !important;
  transform: none !important;
}
[data-admin-legacy][data-admin-page="report8.60"] .rg-format .label {
  font-size: 14px !important;
  font-weight: 600 !important;
  color: #448AFF !important;
  text-align: center !important;
  line-height: 1.25 !important;
}
[data-admin-legacy][data-admin-page="report8.60"] .rg-format:hover .label,
[data-admin-legacy][data-admin-page="report8.60"] .rg-format.selected .label,
[data-admin-legacy][data-admin-page="report8.60"] .rg-format[aria-pressed="true"] .label {
  color: #ffffff !important;
}

/* report wizard: clickable info icon toggles message */
[data-admin-legacy] .rg-info-toggle {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin-left: 6px !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer !important;
  vertical-align: middle !important;
  line-height: 0 !important;
}
[data-admin-legacy] .rg-info-toggle svg {
  width: 18px !important;
  height: 18px !important;
  display: block !important;
  pointer-events: none !important;
}
[data-admin-legacy] .rg-info[hidden],
[data-admin-legacy] .rg-ai-info[hidden] {
  display: none !important;
}

/* feedback47 progress bars — Figma tall pills, blue */
[data-admin-legacy] .fb-bars {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  width: 100% !important;
  height: auto !important;
  margin-top: 8px !important;
  border-radius: 0 !important;
  overflow: visible !important;
  background: transparent !important;
}
[data-admin-legacy] .fb-bars span {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  width: auto !important;
  height: 22px !important;
  border-radius: 999px !important;
  background: #448aff !important;
  opacity: 1 !important;
}
[data-admin-legacy] .fb-card.gold .fb-bars span {
  background: #448aff !important;
}
[data-admin-legacy] .fb-bars span.dim {
  background: #d7e6ff !important;
  opacity: 1 !important;
}

/* Filter dropdown: fully opaque solid card (no glass) */
[data-admin-legacy] .topbar::before {
  pointer-events: none !important;
  z-index: 0 !important;
}
[data-admin-legacy] .top-actions {
  position: relative !important;
  z-index: 20 !important;
}
[data-admin-legacy] .filter-wrap {
  position: relative !important;
  z-index: 9999 !important;
  isolation: isolate !important;
}
[data-admin-legacy] .events-filter-menu,
[data-admin-legacy] .filter-wrap .events-filter-menu,
[data-admin-legacy] .filter-wrap.open .events-filter-menu {
  position: absolute !important;
  z-index: 10000 !important;
  background: #ffffff !important;
  background-color: #ffffff !important;
  background-image: none !important;
  opacity: 1 !important;
  mix-blend-mode: normal !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  filter: none !important;
  border: 1px solid #c5d8f5 !important;
  border-radius: 10px !important;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18) !important;
  overflow: hidden !important;
}
[data-admin-legacy] .events-filter-menu::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  background: #ffffff !important;
  border-radius: inherit !important;
  z-index: -1 !important;
  opacity: 1 !important;
  pointer-events: none !important;
}
[data-admin-legacy] .events-filter-menu button {
  position: relative !important;
  z-index: 1 !important;
  background: #ffffff !important;
  background-color: #ffffff !important;
  opacity: 1 !important;
}
[data-admin-legacy] .events-filter-menu button:hover,
[data-admin-legacy] .events-filter-menu button.active {
  background: #e8f1ff !important;
  background-color: #e8f1ff !important;
}
[data-admin-legacy] .page-title p,
[data-admin-legacy] .page-heading p,
[data-admin-legacy] .page-heading-row .texts p {
  font-family: "Poppins", sans-serif !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  letter-spacing: -0.02em !important;
  line-height: 1.25 !important;
  color: #448AFF !important;
  margin: 2px 0 0 !important;
  opacity: 1 !important;
}
[data-admin-legacy] .top-actions {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  min-height: 36px !important;
}
[data-admin-legacy] .top-actions > .search-wrap,
[data-admin-legacy] .top-actions > .search-bar,
[data-admin-legacy] .top-actions > .icon-btn,
[data-admin-legacy] .top-actions > a.icon-btn {
  display: inline-flex !important;
  align-items: center !important;
  align-self: center !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  flex-shrink: 0 !important;
}
[data-admin-legacy] .top-actions .search-bar {
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  box-sizing: border-box !important;
  padding: 0 8px 0 12px !important;
  gap: 8px !important;
  align-items: center !important;
}
[data-admin-legacy] .top-actions .search-bar > svg {
  width: 16px !important;
  height: 16px !important;
  flex-shrink: 0 !important;
}
[data-admin-legacy] .top-actions .search-bar input {
  height: 100% !important;
  min-width: 0 !important;
  line-height: 1 !important;
  padding: 0 !important;
  margin: 0 !important;
  font-size: 13px !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
[data-admin-legacy] .top-actions > .icon-btn,
[data-admin-legacy] .top-actions > a.icon-btn {
  width: 36px !important;
  height: 36px !important;
  display: inline-grid !important;
  place-items: center !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  line-height: 0 !important;
}
[data-admin-legacy] .top-actions > .icon-btn svg,
[data-admin-legacy] .top-actions > a.icon-btn svg,
[data-admin-legacy] .top-actions .icon-btn.help svg {
  width: 22px !important;
  height: 22px !important;
  max-width: 22px !important;
  max-height: 22px !important;
  display: block !important;
}
[data-admin-legacy] .search-wrap {
  gap: 0 !important;
  height: 36px !important;
}
[data-admin-legacy] .search-bar:has(.filter-wrap) {
  overflow: visible !important;
}
[data-admin-legacy] .search-bar .filter-wrap {
  position: relative !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  width: 22px !important;
  height: 22px !important;
}
[data-admin-legacy] .search-bar .search-filter,
[data-admin-legacy] .search-bar > .icon-btn,
[data-admin-legacy] .search-bar .filter-wrap .icon-btn {
  width: 22px !important;
  height: 22px !important;
  min-width: 22px !important;
  min-height: 22px !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  display: inline-grid !important;
  place-items: center !important;
  color: #448aff !important;
  line-height: 0 !important;
  box-shadow: none !important;
}
[data-admin-legacy] .search-bar .search-filter svg,
[data-admin-legacy] .search-bar > .icon-btn svg,
[data-admin-legacy] .search-bar .filter-wrap .icon-btn svg {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  display: block !important;
}

/* Category titles: match Newly Submitted Events (section-heading ~18px) */
[data-admin-legacy] .detail-actions h2,
[data-admin-legacy] .section-head h2,
[data-admin-legacy] .analytics-section .section-head h2 {
  font-size: 18px !important;
  font-weight: 700 !important;
  color: #000 !important;
  text-shadow: none !important;
  letter-spacing: -0.02em !important;
}

/* Hide template/demo event rows (beats .event-item { display: grid !important }) */
[data-admin-legacy] a.event-item.dc-legacy-hidden,
[data-admin-legacy] a.event-item[hidden],
[data-admin-legacy] .event-item.dc-legacy-hidden,
[data-admin-legacy] .event-item[hidden],
[data-admin-legacy] article.event-card.dc-legacy-hidden,
[data-admin-legacy] article.event-card[hidden],
[data-admin-legacy] .card-row article.event-card.dc-legacy-hidden,
[data-admin-legacy] .card-row article.event-card[hidden],
[data-admin-legacy] table tbody tr.dc-legacy-hidden,
[data-admin-legacy] table tbody tr[hidden] {
  display: none !important;
}

/* Empty event panels: no nested card around the calendar empty state */
[data-admin-legacy] .events-panel > .dc-events-empty {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  margin: 0 !important;
  border-radius: 0 !important;
}

/* Event card header — Figma: large blue Event Name */
[data-admin-legacy] #event-info-card .detail-top-main h3,
[data-admin-legacy] .detail-top-main h3,
[data-admin-legacy] .detail-top h3,
[data-admin-legacy] .detail-card h3.detail-title,
[data-admin-legacy] .detail-card .detail-top h3 {
  font-size: 28px !important;
  font-weight: 700 !important;
  color: #448aff !important;
  line-height: 1.15 !important;
  margin: 0 0 6px !important;
  letter-spacing: -0.02em !important;
}
[data-admin-legacy] #event-info-card .detail-top-main .desc {
  font-size: 14px !important;
  font-weight: 400 !important;
  color: #1e293b !important;
}
[data-admin-legacy] #event-info-card .block-title {
  color: #0f172a !important;
  font-size: 18px !important;
  font-weight: 700 !important;
}
[data-admin-legacy] #event-info-card .approved-status,
[data-admin-legacy] #event-info-card .approved-date {
  display: block !important;
  font-size: 9px !important;
  font-weight: 700 !important;
  color: #448aff !important;
  text-transform: uppercase !important;
  letter-spacing: 0.02em !important;
  margin: 0 !important;
  line-height: 1.1 !important;
}
[data-admin-legacy] #event-info-card .submission-date-label {
  font-size: 7px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
  color: #7aa6ff !important;
  margin: 0 !important;
  line-height: 1.1 !important;
}
[data-admin-legacy] #event-info-card .figma-event-meta {
  gap: 2px !important;
}
[data-admin-legacy] #event-info-card .event-source-tags {
  gap: 4px !important;
  margin-top: 2px !important;
}
[data-admin-legacy] #event-info-card .src-tag {
  height: 14px !important;
  padding: 0 5px !important;
  font-size: 7px !important;
  font-weight: 600 !important;
  border-radius: 999px !important;
}
[data-admin-legacy] #event-info-card .src-tag.eroom {
  background: #ffe3e3 !important;
  color: #c62828 !important;
  border: 1px solid rgba(198, 40, 40, 0.35) !important;
}
[data-admin-legacy] #event-info-card .src-tag.dcspace {
  background: #e8f1ff !important;
  color: #448aff !important;
  border: 1px solid rgba(68, 138, 255, 0.35) !important;
}

/* Organized event view (vorg36) — shrink submission/status/tags */
[data-admin-legacy] .vorg-sub-label {
  margin: 0 0 4px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
  color: #1357C9 !important;
  line-height: 1.2 !important;
}
[data-admin-legacy] .vorg-approval,
[data-admin-legacy] .vorg-approval.is-approved,
[data-admin-legacy] #approval-status {
  margin: 8px 0 4px !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em !important;
  text-transform: uppercase !important;
  color: #448AFF !important;
  line-height: 1.2 !important;
}
[data-admin-legacy] .vorg-approval.is-pending,
[data-admin-page="vorg36"] .rv-card.is-pending-view #approval-status,
[data-admin-page="vorg36"] .rv-card.is-pending-view .vorg-approval.is-pending {
  color: #d4a017 !important;
  font-size: 22px !important;
  font-weight: 700 !important;
}
[data-admin-page="vorg36"] .vorg-view-event {
  display: none !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .vorg-actions {
  display: inline-flex !important;
  align-items: center !important;
  gap: 0 !important;
  margin: 0 !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .vorg-btn {
  display: none !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .vorg-view-event {
  display: inline-block !important;
  margin: 2px 0 0 !important;
  color: #448aff !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  text-decoration: underline !important;
  text-underline-offset: 2px !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .vorg-sub-label {
  color: #448aff !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  margin: 0 0 4px !important;
  text-align: right !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view #event-name,
[data-admin-page="vorg36"] .rv-card.is-pending-view .vorg-head-main h2 {
  color: #448aff !important;
  font-size: 28px !important;
  font-weight: 700 !important;
  margin: 0 0 8px !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .vorg-head-main .desc {
  color: #0f172a !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .rv-section-label {
  color: #0f172a !important;
  font-size: 16px !important;
  font-weight: 700 !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .rv-meta-grid {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 12px !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .rv-meta {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
  min-height: 88px !important;
  padding: 28px 10px 14px !important;
  background: #ffffff !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  border-radius: 12px !important;
  gap: 0 !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .rv-meta .k {
  position: absolute !important;
  top: 10px !important;
  left: 12px !important;
  color: #64748b !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  text-align: left !important;
}
[data-admin-page="vorg36"] .rv-card.is-pending-view .rv-meta .v {
  text-align: center !important;
  color: #0f172a !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
}

/* vorg36 rejected — Figma header */
[data-admin-page="vorg36"] .rv-card.is-rejected-view .vorg-view-event,
[data-admin-page="vorg36"] .rv-card.is-rejected-view .vorg-actions {
  display: none !important;
}
[data-admin-page="vorg36"] .rv-card.is-rejected-view .vorg-head {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 24px !important;
}
[data-admin-page="vorg36"] .rv-card.is-rejected-view #event-name,
[data-admin-page="vorg36"] .rv-card.is-rejected-view .vorg-head-main h2 {
  color: #448aff !important;
  font-size: 28px !important;
  font-weight: 700 !important;
  margin: 0 0 8px !important;
}
[data-admin-page="vorg36"] .rv-card.is-rejected-view .vorg-head-main .desc {
  color: #0f172a !important;
}
[data-admin-page="vorg36"] .rv-card.is-rejected-view .vorg-sub-label {
  color: #448aff !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  margin: 0 !important;
  text-align: right !important;
}
[data-admin-page="vorg36"] .vorg-approval.is-rejected,
[data-admin-page="vorg36"] .rv-card.is-rejected-view #approval-status,
[data-admin-page="vorg36"] .rv-card.is-rejected-view .vorg-approval.is-rejected {
  color: #b12b2b !important;
  font-size: 22px !important;
  font-weight: 700 !important;
  margin: 4px 0 0 !important;
  text-align: right !important;
}

/* vorg36 validated — eRoom validated, awaiting DC Space accept */
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-head {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 24px !important;
}
[data-admin-page="vorg36"] .rv-card.is-validated-view #event-name,
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-head-main h2 {
  color: #448aff !important;
  font-size: 28px !important;
  font-weight: 700 !important;
  margin: 0 0 8px !important;
}
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-head-main .desc {
  color: #0f172a !important;
}
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-sub-label {
  color: #448aff !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  margin: 0 !important;
  text-align: right !important;
}
[data-admin-page="vorg36"] .rv-card.is-validated-view #approval-status,
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-approval {
  color: #448aff !important;
  font-size: 22px !important;
  font-weight: 700 !important;
  margin: 4px 0 2px !important;
  text-align: right !important;
}
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-view-event {
  display: inline-block !important;
  margin: 0 !important;
  color: #448aff !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  text-decoration: underline !important;
  text-underline-offset: 2px !important;
  white-space: nowrap !important;
}
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-actions {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 12px !important;
  margin: 0 !important;
}
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-btn.dcspace {
  display: none !important;
}
[data-admin-page="vorg36"] .rv-card.is-validated-view .vorg-btn.eroom {
  display: inline-flex !important;
}
[data-admin-legacy] .vorg-head {
  margin-bottom: 10px !important;
}
[data-admin-legacy] .vorg-head-right {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  gap: 0 !important;
}
[data-admin-legacy] .vorg-actions,
[data-admin-legacy] .vorg-head-right .vorg-actions {
  gap: 8px !important;
  margin: 0 !important;
}
[data-admin-legacy] .vorg-btn,
[data-admin-legacy] .vorg-btn.eroom,
[data-admin-legacy] .vorg-btn.dcspace {
  height: 28px !important;
  min-height: 28px !important;
  min-width: 0 !important;
  padding: 0 12px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  border-radius: 5px !important;
  line-height: 1 !important;
}
[data-admin-legacy] .vorg-btn.eroom {
  background: #ffe3e3 !important;
  color: #c62828 !important;
  border: 1px solid rgba(198, 40, 40, 0.35) !important;
}

/* Program & Activities — closer cards, less empty box height */
[data-admin-legacy] .vorg-program {
  display: grid !important;
  grid-template-columns: 140px minmax(0, 1fr) !important;
  gap: 8px !important;
  align-items: stretch !important;
  margin: 0 0 10px !important;
}
[data-admin-legacy] .vorg-program .rv-file-card,
[data-admin-legacy] .vorg-program .rv-file-card.tall {
  width: 100% !important;
  min-height: 0 !important;
  height: auto !important;
  gap: 4px !important;
  padding: 12px 10px !important;
  margin: 0 !important;
  background: #eaf2ff !important;
  border: 1px solid rgba(68, 138, 255, 0.18) !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-legacy] .vorg-program .rv-file-card svg {
  width: 28px !important;
  height: 28px !important;
  margin: 0 0 2px !important;
}
[data-admin-legacy] .vorg-program .rv-file-card .title,
[data-admin-legacy] .vorg-program .rv-file-card .title.muted {
  margin: 0 !important;
  font-size: 12px !important;
  font-weight: 650 !important;
  color: #1e293b !important;
}
[data-admin-legacy] .vorg-program .rv-file-card .fname {
  margin: 0 !important;
  font-size: 11px !important;
  color: #64748b !important;
}
[data-admin-legacy] .vorg-announce {
  min-height: 0 !important;
  height: auto !important;
  gap: 6px !important;
  padding: 12px 14px !important;
  margin: 0 !important;
  background: #eaf2ff !important;
  border: 1px solid rgba(68, 138, 255, 0.18) !important;
  border-radius: 10px !important;
}
[data-admin-legacy] .vorg-announce .k {
  margin: 0 !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
  color: #64748b !important;
}
[data-admin-legacy] .vorg-announce .v {
  margin: 0 !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  color: #0f172a !important;
}

/* Also tighten aed15 program row if present */
[data-admin-legacy] #event-info-card .program-cards.figma-program {
  gap: 8px !important;
  grid-template-columns: 140px minmax(0, 1fr) !important;
}
[data-admin-legacy] #event-info-card .program-file-card,
[data-admin-legacy] #event-info-card .announce-card {
  min-height: 0 !important;
  height: auto !important;
  padding: 12px 12px !important;
}

/* Files Required + Attachments — compact cards, closer together */
[data-admin-legacy] .rv-files {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  margin: 0 0 10px !important;
}
[data-admin-legacy] .rv-files .rv-file-card,
[data-admin-legacy] .rv-files .rv-file-card.tall {
  width: 132px !important;
  max-width: 132px !important;
  min-height: 0 !important;
  height: auto !important;
  gap: 4px !important;
  padding: 12px 10px !important;
  margin: 0 !important;
  background: #eaf2ff !important;
  border: 1px solid rgba(68, 138, 255, 0.18) !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-legacy] .rv-files .rv-file-card svg {
  width: 26px !important;
  height: 26px !important;
  margin: 0 0 2px !important;
}
[data-admin-legacy] .rv-files .rv-file-card .title,
[data-admin-legacy] .rv-files .rv-file-card .title.muted {
  margin: 0 !important;
  font-size: 12px !important;
  font-weight: 650 !important;
  color: #1e293b !important;
}
[data-admin-legacy] .rv-files .rv-file-card .fname {
  margin: 0 !important;
  font-size: 11px !important;
  color: #64748b !important;
}
[data-admin-legacy] #event-info-card .files-row.figma-files {
  gap: 8px !important;
}
[data-admin-legacy] #event-info-card .files-row .file-card {
  width: 132px !important;
  max-width: 132px !important;
  min-height: 0 !important;
  height: auto !important;
  padding: 12px 10px !important;
  gap: 4px !important;
}
[data-admin-legacy] #event-info-card .approved-by,
[data-admin-legacy] #event-info-card .poster {
  display: none !important;
}
[data-admin-legacy] #event-info-card .field-box .label {
  color: #94a3b8 !important;
  text-transform: uppercase !important;
  text-align: left !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1.2 !important;
}
[data-admin-legacy] #event-info-card .field-box .value {
  color: #0f172a !important;
  font-weight: 700 !important;
  text-align: center !important;
  margin: 0 !important;
  padding: 0 !important;
}
[data-admin-legacy] #event-info-card .field-box {
  padding: 8px 10px 12px !important;
  gap: 10px !important;
  min-height: 78px !important;
  justify-content: flex-start !important;
  align-items: stretch !important;
}
[data-admin-legacy] #event-info-card .block-title {
  margin: 18px 0 10px !important;
  color: #0f172a !important;
  font-size: 16px !important;
  font-weight: 700 !important;
}
[data-admin-legacy] #event-info-card .program-file-card,
[data-admin-legacy] #event-info-card .files-row .file-card {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 4px !important;
  min-height: 112px !important;
  padding: 12px 10px 10px !important;
  margin: 0 !important;
  background: #eaf2ff !important;
  border: 1px solid rgba(68, 138, 255, 0.14) !important;
  border-radius: 12px !important;
  box-sizing: border-box !important;
}
[data-admin-legacy] #event-info-card .program-file-card svg,
[data-admin-legacy] #event-info-card .files-row .file-card svg {
  width: 26px !important;
  height: 26px !important;
  margin: 0 0 2px !important;
  padding: 0 !important;
  color: #0f172a !important;
}
[data-admin-legacy] #event-info-card .program-file-card h4,
[data-admin-legacy] #event-info-card .files-row .file-card strong {
  margin: 0 !important;
  padding: 0 !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.25 !important;
  color: #0f172a !important;
}
[data-admin-legacy] #event-info-card .file-link,
[data-admin-legacy] #event-info-card .files-row .file-card span,
[data-admin-legacy] #event-info-card .program-file-card .file-link {
  margin: 2px 0 0 !important;
  padding: 0 !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #448aff !important;
}
[data-admin-legacy] #event-info-card .announce-card {
  padding: 12px 16px !important;
  gap: 6px !important;
  justify-content: flex-start !important;
  align-items: flex-start !important;
}
[data-admin-legacy] #event-info-card .announce-card .meta-label {
  margin: 0 !important;
  font-size: 10px !important;
  color: #94a3b8 !important;
}
[data-admin-legacy] #event-info-card .announce-card .meta-value {
  margin: 0 !important;
  font-size: 13px !important;
  color: #0f172a !important;
}

/* Admin Notes History: same modern blue card on all event detail pages */
[data-admin-legacy] .notes-panel {
  background: #ffffff !important;
  border: 1px solid rgba(68, 138, 255, 0.22) !important;
  border-radius: 14px !important;
  padding: 18px 20px !important;
  box-shadow: 0 4px 18px rgba(68, 138, 255, 0.08) !important;
}
[data-admin-legacy] .note-card {
  background: rgba(68, 138, 255, 0.08) !important;
  border: 1px solid rgba(68, 138, 255, 0.14) !important;
  border-radius: 12px !important;
  padding: 16px 18px !important;
  margin-bottom: 16px !important;
}
[data-admin-legacy] .note-card-top .label {
  color: #1357c9 !important;
  font-size: 16px !important;
  font-weight: 600 !important;
}
[data-admin-legacy] .note-body {
  background: #fff !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  border-radius: 12px !important;
  color: #1e293b !important;
}
[data-admin-legacy] .notes-sort {
  color: #448aff !important;
}
[data-admin-legacy] .status-pill {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-width: 96px !important;
  height: 26px !important;
  padding: 0 16px !important;
  border-radius: 999px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
}
[data-admin-legacy] .status-pill.is-resolve {
  background: #f0b4b4 !important;
  border: 1.5px solid #a52a2a !important;
  color: #a52a2a !important;
}
[data-admin-legacy] .status-pill.is-resolved {
  background: #c8f5cb !important;
  border: 1.5px solid transparent !important;
  color: #0f7a14 !important;
}

/* Live Attendance banner — right arrow hover */
[data-admin-legacy] .live-banner .banner-next {
  width: 36px !important;
  height: 36px !important;
  border: none !important;
  border-radius: 999px !important;
  background: transparent !important;
  color: #604d18 !important;
  cursor: pointer !important;
  display: grid !important;
  place-items: center !important;
  flex-shrink: 0 !important;
  transition: color 0.18s ease, background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease !important;
}
[data-admin-legacy] .live-banner .banner-next svg {
  transition: transform 0.18s ease !important;
}
[data-admin-legacy] .live-banner .banner-next:hover {
  color: #1357c9 !important;
  background: rgba(255, 255, 255, 0.55) !important;
  box-shadow: 0 2px 10px rgba(19, 87, 201, 0.22) !important;
  transform: translateX(3px) !important;
}
[data-admin-legacy] .live-banner .banner-next:hover svg {
  transform: translateX(2px) !important;
}
[data-admin-legacy] .live-banner .banner-next:active {
  transform: translateX(1px) scale(0.96) !important;
}
[data-admin-legacy] .live-banner .banner-next:focus-visible {
  outline: 2px solid rgba(68, 138, 255, 0.55) !important;
  outline-offset: 2px !important;
}

/* RFID live attendance — taller participant box + text spacing */
[data-admin-legacy] aside.profile-card[aria-label="Scanned participant"],
[data-admin-legacy] body:has(.tap-panel) .profile-card {
  min-height: 560px !important;
  padding: 36px 22px 40px !important;
}
[data-admin-legacy] body:has(.tap-panel) .profile-card .avatar-wrap {
  margin-bottom: 24px !important;
}
[data-admin-legacy] body:has(.tap-panel) .profile-card .profile-name {
  margin: 8px 0 22px !important;
  padding: 6px 0 !important;
}
[data-admin-legacy] body:has(.tap-panel) .profile-card .profile-meta {
  gap: 14px !important;
  padding: 8px 0 4px !important;
}
[data-admin-legacy] body:has(.tap-panel) .profile-card .profile-meta span {
  padding: 4px 0 !important;
  margin: 2px 0 !important;
  line-height: 1.55 !important;
}

/* SUBMITTED BY heading — slightly smaller */
[data-admin-legacy] .submitter-card h3,
[data-admin-legacy] .detail-card.pending-only > h3,
[data-admin-legacy] h3[aria-label="Submitted by"] {
  font-size: 18px !important;
  font-weight: 700 !important;
  color: #000 !important;
}

/* Users page — Figma metric cards */
[data-admin-legacy] .users-stats {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 12px !important;
}
[data-admin-legacy] .user-stat {
  min-height: 100px !important;
  padding: 12px 14px 12px !important;
  border-radius: 14px !important;
  border: 1px solid rgba(68, 138, 255, 0.08) !important;
  box-shadow: 0 4px 14px rgba(68, 138, 255, 0.1) !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
}
[data-admin-legacy] .user-stat::before {
  display: none !important;
  content: none !important;
}
[data-admin-legacy] .user-stat.total {
  background: linear-gradient(135deg, #ffffff 0%, #fff8ea 48%, #ffe9c4 100%) !important;
}
[data-admin-legacy] .user-stat.active {
  background: linear-gradient(135deg, #ffffff 0%, #eefbee 48%, #d8f5d4 100%) !important;
}
[data-admin-legacy] .user-stat.new {
  background: linear-gradient(135deg, #ffffff 0%, #eef4ff 48%, #d6e6ff 100%) !important;
}
[data-admin-legacy] .user-stat.faculty {
  background: linear-gradient(135deg, #ffffff 0%, #f8effc 48%, #efd9f7 100%) !important;
}
[data-admin-legacy] .user-stat .label {
  font-size: 13px !important;
  font-weight: 600 !important;
  margin: 0 0 10px !important;
}
[data-admin-legacy] .user-stat.total .label,
[data-admin-legacy] .user-stat.total .value { color: #6b5720 !important; }
[data-admin-legacy] .user-stat.active .label,
[data-admin-legacy] .user-stat.active .value { color: #1f9a3a !important; }
[data-admin-legacy] .user-stat.new .label,
[data-admin-legacy] .user-stat.new .value { color: #448aff !important; }
[data-admin-legacy] .user-stat.faculty .label,
[data-admin-legacy] .user-stat.faculty .value { color: #9b5ba7 !important; }
[data-admin-legacy] .user-stat .row {
  display: flex !important;
  align-items: flex-end !important;
  justify-content: space-between !important;
  margin-top: auto !important;
}
[data-admin-legacy] .user-stat .value {
  font-size: 30px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
}
[data-admin-legacy] .user-stat .delta {
  font-size: 13px !important;
  font-weight: 600 !important;
  padding-bottom: 2px !important;
}
[data-admin-legacy] .user-stat .delta.up { color: #11cc19 !important; }
[data-admin-legacy] .user-stat .delta.down { color: #d91616 !important; }

/* Users toolbar — compact one row, selects top-right */
[data-admin-legacy] .users-toolbar {
  display: flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 10px !important;
  width: 100% !important;
  min-height: 32px !important;
  margin-bottom: 14px !important;
  overflow: visible !important;
  position: relative !important;
  z-index: 40 !important;
}
[data-admin-legacy] .users-toolbar .period-bar {
  display: inline-flex !important;
  align-items: center !important;
  height: 32px !important;
  padding: 2px !important;
  gap: 2px !important;
  border-radius: 8px !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  background: rgba(68, 138, 255, 0.1) !important;
  box-sizing: border-box !important;
}
[data-admin-legacy] .users-toolbar .period-bar button {
  height: 26px !important;
  padding: 0 8px !important;
  border: none !important;
  border-radius: 6px !important;
  background: transparent !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #448aff !important;
  line-height: 1 !important;
  white-space: nowrap !important;
}
[data-admin-legacy] .users-toolbar .period-bar button.active {
  background: rgba(68, 138, 255, 0.22) !important;
  color: #1357c9 !important;
}
[data-admin-legacy] .users-toolbar .toolbar-selects {
  display: inline-flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 6px !important;
  margin-left: auto !important;
  height: auto !important;
  min-height: 32px !important;
  overflow: visible !important;
  position: relative !important;
  z-index: 45 !important;
}
[data-admin-legacy] .users-toolbar .toolbar-select {
  height: 32px !important;
  min-height: 32px !important;
  max-height: 32px !important;
  padding: 0 8px !important;
  gap: 5px !important;
  border-radius: 8px !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  background: rgba(68, 138, 255, 0.1) !important;
  color: #448aff !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  box-sizing: border-box !important;
}
[data-admin-legacy] .users-toolbar .toolbar-select svg {
  width: 12px !important;
  height: 12px !important;
}

/* Profile banner avatar — no white border ring */
[data-admin-legacy] .profile-banner .profile-avatar,
[data-admin-legacy] .update-banner .profile-avatar,
[data-admin-legacy] .ereg-banner .profile-avatar {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}
[data-admin-legacy] .profile-banner .profile-avatar:hover,
[data-admin-legacy] .update-banner .profile-avatar:hover,
[data-admin-legacy] .ereg-banner .profile-avatar:hover {
  box-shadow: none !important;
}

/* Attendance: Events on This Day title */
[data-admin-legacy] .att-events-title {
  color: #000000 !important;
}

/* Attendance event details headings — black */
[data-admin-legacy] .deets-page-title,
[data-admin-legacy] .deets-page-title > span,
[data-admin-legacy] .deets-section-head h2,
[data-admin-legacy] .listp-toolbar h2 {
  color: #000000 !important;
}

/* cert45 stat cards — Figma gradient tiles */
[data-admin-legacy] .cert-stats {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 16px !important;
}
[data-admin-legacy] .cert-stat {
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
  min-height: 118px !important;
  padding: 16px 18px 16px !important;
  border-radius: 16px !important;
  border: none !important;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.07) !important;
  overflow: hidden !important;
}
[data-admin-legacy] .cert-stat::before {
  display: none !important;
  content: none !important;
}
[data-admin-legacy] .cert-stat .label {
  font-size: 13px !important;
  font-weight: 600 !important;
  margin-bottom: 18px !important;
}
[data-admin-legacy] .cert-stat .row {
  display: flex !important;
  align-items: flex-end !important;
  justify-content: space-between !important;
  margin-top: auto !important;
}
[data-admin-legacy] .cert-stat .value {
  font-size: 36px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
}
[data-admin-legacy] .cert-stat .delta {
  font-size: 14px !important;
  font-weight: 600 !important;
  padding-bottom: 4px !important;
}
[data-admin-legacy] .cert-stat .delta.up { color: #11cc19 !important; }
[data-admin-legacy] .cert-stat .delta.down { color: #d91616 !important; }
[data-admin-legacy] .cert-stat.generated {
  background: linear-gradient(118deg, #ffffff 0%, #fffaf0 42%, #f6e7c4 100%) !important;
}
[data-admin-legacy] .cert-stat.generated .label,
[data-admin-legacy] .cert-stat.generated .value { color: #5c4014 !important; }
[data-admin-legacy] .cert-stat.generating {
  background: linear-gradient(118deg, #ffffff 0%, #eef9fd 42%, #c8ebf8 100%) !important;
}
[data-admin-legacy] .cert-stat.generating .label,
[data-admin-legacy] .cert-stat.generating .value { color: #155c7a !important; }
[data-admin-legacy] .cert-stat.events {
  background: linear-gradient(118deg, #ffffff 0%, #eef2ff 42%, #d2dbff 100%) !important;
}
[data-admin-legacy] .cert-stat.events .label,
[data-admin-legacy] .cert-stat.events .value { color: #0b4fac !important; }
[data-admin-legacy] .cert-stat.reviews {
  background: linear-gradient(118deg, #ffffff 0%, #fdf2f2 42%, #f5d6d6 100%) !important;
}
[data-admin-legacy] .cert-stat.reviews .label,
[data-admin-legacy] .cert-stat.reviews .value { color: #a62828 !important; }

/* cert45 board columns — Figma */
[data-admin-legacy] .cert-boards {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 18px !important;
  align-items: start !important;
}
[data-admin-legacy] .cert-board {
  border: 2px solid #448aff !important;
  border-radius: 18px !important;
  box-shadow: none !important;
  background: #fff !important;
  overflow: hidden !important;
}
[data-admin-legacy] .cert-board:hover {
  border-color: #448aff !important;
  box-shadow: none !important;
}
[data-admin-legacy] .cert-board-head {
  background: #448aff !important;
  color: #fff !important;
  padding: 14px 14px 14px 16px !important;
  min-height: 0 !important;
}
[data-admin-legacy] .cert-board-head .title {
  font-size: 13px !important;
  font-weight: 700 !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
  color: #fff !important;
}
[data-admin-legacy] .cert-board-body {
  gap: 14px !important;
  padding: 14px !important;
  background: #fff !important;
}
[data-admin-legacy] .cert-card,
[data-admin-legacy] a.cert-card {
  border: 1px solid #448aff !important;
  border-radius: 14px !important;
  box-shadow: 0 4px 14px rgba(68, 138, 255, 0.22) !important;
  background: #fff !important;
  padding: 14px 16px 16px !important;
}
[data-admin-legacy] .cert-card h3 {
  color: #448aff !important;
  font-size: 14px !important;
  font-weight: 650 !important;
  margin: 0 0 12px !important;
}
[data-admin-legacy] .cert-card .k,
[data-admin-legacy] .progress-meta .k {
  color: #64748b !important;
  font-size: 11px !important;
  letter-spacing: 0.06em !important;
  text-transform: uppercase !important;
}
[data-admin-legacy] .cert-card .v.danger { color: #9b1c1c !important; }
[data-admin-legacy] .cert-card .v.action { color: #448aff !important; }
[data-admin-legacy] .cert-card .v.warn { color: #c47a12 !important; }
[data-admin-legacy] .cert-card .v.pct {
  color: #448aff !important;
  font-size: 18px !important;
  font-weight: 700 !important;
}
[data-admin-legacy] .timeline-num {
  width: 28px !important;
  height: 28px !important;
  background: #448aff !important;
  box-shadow: none !important;
}
[data-admin-legacy] .timeline-label {
  display: flex !important;
  flex-direction: column !important;
  color: #64748b !important;
}
[data-admin-legacy] .timeline-label .tl-bot {
  color: #448aff !important;
  font-weight: 650 !important;
}
[data-admin-legacy] .progress-meta .pct {
  color: #448aff !important;
  font-weight: 700 !important;
}
[data-admin-legacy] .bar-row {
  display: flex !important;
  gap: 5px !important;
  background: transparent !important;
  overflow: visible !important;
  height: auto !important;
}
[data-admin-legacy] .bar-row span {
  height: 10px !important;
  border-radius: 999px !important;
  background: #448aff !important;
}
[data-admin-legacy] .bar-row span.dim {
  background: #d7e6ff !important;
}

/* cert45 Certificate Processing Status footer — Figma */
[data-admin-legacy][data-admin-page="cert45"] .cert-section-title {
  color: #000000 !important;
}
[data-admin-legacy][data-admin-page="report51"] .rp-stat {
  position: relative !important;
  overflow: hidden !important;
  padding: 36px 18px 18px !important;
}
[data-admin-legacy][data-admin-page="report51"] .rp-open {
  position: absolute !important;
  top: 10px !important;
  right: 10px !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 50% !important;
  display: grid !important;
  place-items: center !important;
  padding: 0 !important;
  z-index: 3 !important;
}
[data-admin-legacy][data-admin-page="report51"] .rp-stat .name {
  max-width: 140px !important;
  padding: 0 10px !important;
}
[data-admin-legacy][data-admin-page="cert45"] .toolbar-selects .cert-dd-wrap {
  position: relative !important;
  display: inline-flex !important;
  z-index: 40 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .toolbar-select .toolbar-select-label {
  max-width: 150px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-dd-menu {
  position: absolute !important;
  top: calc(100% + 6px) !important;
  left: 0 !important;
  min-width: 220px !important;
  max-width: min(420px, 92vw) !important;
  max-height: 320px !important;
  overflow: auto !important;
  padding: 8px !important;
  background: #fff !important;
  border: 1px solid rgba(19, 87, 201, 0.22) !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(19, 87, 201, 0.12) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  z-index: 60 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-dd-menu[hidden] {
  display: none !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-course-menu {
  min-width: 280px !important;
  right: 0 !important;
  left: auto !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-org-menu {
  min-width: 300px !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-date-menu {
  min-width: 260px !important;
  padding: 10px !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-dd-option {
  border: none !important;
  background: transparent !important;
  text-align: left !important;
  padding: 8px 10px !important;
  border-radius: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  line-height: 1.35 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-dd-option.is-nested {
  padding-left: 22px !important;
  font-weight: 400 !important;
  color: #3476E3 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-dd-option:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-dd-option.is-active {
  background: rgba(68, 138, 255, 0.2) !important;
  font-weight: 600 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-org-section {
  margin: 6px 4px 4px !important;
  padding: 6px 6px 4px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  letter-spacing: 0.04em !important;
  color: #1357C9 !important;
  border-bottom: 1px solid rgba(68, 138, 255, 0.16) !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-org-group {
  margin: 6px 4px 2px !important;
  padding: 4px 6px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  color: #3476E3 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-org-option {
  padding-left: 18px !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-head {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  margin-bottom: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: #1357C9 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-head button {
  width: 28px !important;
  height: 28px !important;
  border: none !important;
  border-radius: 6px !important;
  background: rgba(68, 138, 255, 0.12) !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  font-size: 14px !important;
  line-height: 1 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-weekdays,
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-grid {
  display: grid !important;
  grid-template-columns: repeat(7, 1fr) !important;
  gap: 2px !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-weekdays span {
  text-align: center !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  color: #3476E3 !important;
  padding: 4px 0 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-grid button {
  height: 30px !important;
  border: none !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #1357C9 !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-grid button:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-grid button.is-today {
  border: 1px solid rgba(68, 138, 255, 0.45) !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-grid button.is-selected {
  background: rgba(68, 138, 255, 0.22) !important;
  font-weight: 700 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-cal-grid button.is-muted {
  color: #9bb8ef !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .toolbar-selects .fb47-dd-wrap {
  position: relative !important;
  display: inline-flex !important;
  z-index: 40 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .toolbar-select .toolbar-select-label {
  max-width: 150px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-dd-menu {
  position: absolute !important;
  top: calc(100% + 6px) !important;
  left: 0 !important;
  min-width: 220px !important;
  max-width: min(420px, 92vw) !important;
  max-height: 320px !important;
  overflow: auto !important;
  padding: 8px !important;
  background: #fff !important;
  border: 1px solid rgba(19, 87, 201, 0.22) !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(19, 87, 201, 0.12) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  z-index: 60 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-dd-menu[hidden] {
  display: none !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-course-menu {
  min-width: 280px !important;
  right: 0 !important;
  left: auto !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-org-menu {
  min-width: 300px !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-date-menu {
  min-width: 260px !important;
  padding: 10px !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-dd-option {
  border: none !important;
  background: transparent !important;
  text-align: left !important;
  padding: 8px 10px !important;
  border-radius: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  line-height: 1.35 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-dd-option.is-nested {
  padding-left: 22px !important;
  font-weight: 400 !important;
  color: #3476E3 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-dd-option:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-dd-option.is-active {
  background: rgba(68, 138, 255, 0.2) !important;
  font-weight: 600 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-org-section {
  margin: 6px 4px 4px !important;
  padding: 6px 6px 4px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  letter-spacing: 0.04em !important;
  color: #1357C9 !important;
  border-bottom: 1px solid rgba(68, 138, 255, 0.16) !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-org-group {
  margin: 6px 4px 2px !important;
  padding: 4px 6px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  color: #3476E3 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-org-option {
  padding-left: 18px !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-head {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  margin-bottom: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: #1357C9 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-head button {
  width: 28px !important;
  height: 28px !important;
  border: none !important;
  border-radius: 6px !important;
  background: rgba(68, 138, 255, 0.12) !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  font-size: 14px !important;
  line-height: 1 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-weekdays,
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-grid {
  display: grid !important;
  grid-template-columns: repeat(7, 1fr) !important;
  gap: 2px !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-weekdays span {
  text-align: center !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  color: #3476E3 !important;
  padding: 4px 0 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-grid button {
  height: 30px !important;
  border: none !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #1357C9 !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-grid button:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-grid button.is-today {
  border: 1px solid rgba(68, 138, 255, 0.45) !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-grid button.is-selected {
  background: rgba(68, 138, 255, 0.22) !important;
  font-weight: 700 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-cal-grid button.is-muted {
  color: #9bb8ef !important;
}
/* Shared Date/Org/Course dropdowns — user27 */
[data-admin-legacy][data-admin-page="user27"] .admin-dd-wrap,
[data-admin-legacy][data-admin-page="user27"] .u27-dd-wrap {
  position: relative !important;
  display: inline-flex !important;
  z-index: 40 !important;
}
[data-admin-legacy][data-admin-page="user27"] .toolbar-selects {
  overflow: visible !important;
  position: relative !important;
  z-index: 45 !important;
}
[data-admin-legacy][data-admin-page="user27"] .toolbar-select .toolbar-select-label {
  max-width: 150px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-dd-menu {
  position: absolute !important;
  top: calc(100% + 6px) !important;
  left: 0 !important;
  min-width: 220px !important;
  max-width: min(420px, 92vw) !important;
  max-height: 320px !important;
  overflow: auto !important;
  padding: 8px !important;
  background: #fff !important;
  border: 1px solid rgba(19, 87, 201, 0.22) !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(19, 87, 201, 0.12) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  z-index: 90 !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-dd-menu[hidden] {
  display: none !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-course-menu {
  min-width: 280px !important;
  right: 0 !important;
  left: auto !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-org-menu {
  min-width: 300px !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-date-menu {
  min-width: 260px !important;
  padding: 10px !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-dd-option {
  border: none !important;
  background: transparent !important;
  text-align: left !important;
  padding: 8px 10px !important;
  border-radius: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  line-height: 1.35 !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-dd-option.is-nested {
  padding-left: 22px !important;
  font-weight: 400 !important;
  color: #3476E3 !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-dd-option:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-dd-option.is-active {
  background: rgba(68, 138, 255, 0.2) !important;
  font-weight: 600 !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-org-section {
  margin: 6px 4px 4px !important;
  padding: 6px 6px 4px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  letter-spacing: 0.04em !important;
  color: #1357C9 !important;
  border-bottom: 1px solid rgba(68, 138, 255, 0.16) !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-org-group {
  margin: 6px 4px 2px !important;
  padding: 4px 6px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  color: #3476E3 !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-org-option {
  padding-left: 18px !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-head {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  margin-bottom: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: #1357C9 !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-head button {
  width: 28px !important;
  height: 28px !important;
  border: none !important;
  border-radius: 6px !important;
  background: rgba(68, 138, 255, 0.12) !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  font-size: 14px !important;
  line-height: 1 !important;
  transform: none !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-weekdays,
[data-admin-legacy][data-admin-page="user27"] .admin-cal-grid {
  display: grid !important;
  grid-template-columns: repeat(7, 1fr) !important;
  gap: 2px !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-weekdays span {
  text-align: center !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  color: #3476E3 !important;
  padding: 4px 0 !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-grid button {
  height: 30px !important;
  border: none !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #1357C9 !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  transform: none !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-grid button:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-grid button.is-today {
  border: 1px solid rgba(68, 138, 255, 0.45) !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-grid button.is-selected {
  background: rgba(68, 138, 255, 0.22) !important;
  font-weight: 700 !important;
}
[data-admin-legacy][data-admin-page="user27"] .admin-cal-grid button.is-muted {
  color: #9bb8ef !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-table-wrap {
  overflow-x: auto !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-table {
  width: 100% !important;
  min-width: 920px !important;
  table-layout: fixed !important;
  border-collapse: collapse !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-table thead th {
  color: #448aff !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: clip !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
  padding: 12px 10px !important;
  vertical-align: middle !important;
  line-height: 1.2 !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-table thead th:nth-child(1) {
  width: 26% !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-table thead th:nth-child(2),
[data-admin-legacy][data-admin-page="cert45"] .cert-table thead th:nth-child(3),
[data-admin-legacy][data-admin-page="cert45"] .cert-table thead th:nth-child(4) {
  width: 20% !important;
  text-align: center !important;
}
[data-admin-legacy][data-admin-page="cert45"] .cert-table thead th:nth-child(5) {
  width: 14% !important;
  text-align: center !important;
}
[data-admin-legacy] .cert-footer {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px 20px !important;
  margin: 14px 0 28px !important;
  color: #1357C9 !important;
}
[data-admin-legacy] .cert-sort {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  height: auto !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
[data-admin-legacy] .cert-sort button,
[data-admin-legacy] .cert-sort button[data-sort] {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  height: 32px !important;
  min-height: 32px !important;
  padding: 0 14px !important;
  background: #ffffff !important;
  border: 1.5px solid #1357C9 !important;
  border-radius: 8px !important;
  color: #1357C9 !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  cursor: pointer !important;
  box-shadow: none !important;
}
[data-admin-legacy] .cert-sort button .sort-arrow {
  font-size: 14px !important;
  font-weight: 700 !important;
}
[data-admin-legacy] .cert-sort button:hover,
[data-admin-legacy] .cert-sort button.active {
  background: #ffffff !important;
  border-color: #1357C9 !important;
  color: #1357C9 !important;
}
[data-admin-legacy] .cert-pager {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  margin-left: auto !important;
}
[data-admin-legacy] .cert-entries {
  color: #6b8fd4 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
}
[data-admin-legacy] .cert-show {
  display: none !important;
}
[data-admin-legacy] .cert-page {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  color: #6b8fd4 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
}
[data-admin-legacy] .cert-page .nav-btn,
[data-admin-legacy] .cert-page button {
  display: inline-grid !important;
  place-items: center !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  background: #ffffff !important;
  border: 1.5px solid #1357C9 !important;
  border-radius: 6px !important;
  color: #1357C9 !important;
  font-size: 16px !important;
  font-weight: 600 !important;
  box-shadow: none !important;
}
[data-admin-legacy] .cert-page span {
  color: #6b8fd4 !important;
}

/* Match Attendance Statistics / Insights to AI Recommendations size */
[data-admin-legacy] .metric-card-head h3,
[data-admin-legacy] .ai-reco-title {
  font-size: 15px !important;
  font-weight: 650 !important;
}

/* deets43 Event Name — same size as Event Information (font-xl / 18px) */
[data-admin-legacy] #event-info-section #event-name,
[data-admin-legacy] #event-info-section .detail-top h3,
[data-admin-legacy] #event-name {
  font-size: 18px !important;
  font-weight: 650 !important;
  line-height: 1.3 !important;
}

/* Attendance: time group labels */
[data-admin-legacy] .att-time-head strong {
  color: #000000 !important;
}

/* Attendance: event name color */
[data-admin-legacy] .att-event-top h3,
[data-admin-legacy] .att-event-card h3,
[data-admin-legacy] .att-event-main h3 {
  color: #1357C9 !important;
}

/* Attendance: org/course pill */
[data-admin-legacy] .att-org-pill,
[data-admin-legacy] .att-org-pill.gold,
[data-admin-legacy] .att-org-pill.blue {
  color: #1357C9 !important;
  border-color: #1357C9 !important;
}

/* Attendance: status pills — black text/border, colored dots */
[data-admin-legacy] .att-status,
[data-admin-legacy] .att-status.ongoing,
[data-admin-legacy] .att-status.upcoming,
[data-admin-legacy] .att-status.complete {
  color: #000000 !important;
  border-color: #000000 !important;
}
[data-admin-legacy] .att-status .dot {
  display: inline-block !important;
  width: 11px !important;
  height: 11px !important;
  min-width: 11px !important;
  min-height: 11px !important;
  border-radius: 50% !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
  border: 1px solid rgba(0, 0, 0, 0.15) !important;
}
[data-admin-legacy] .att-status.ongoing .dot {
  background: #16a34a !important;
  background-color: #16a34a !important;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25) !important;
}
[data-admin-legacy] .att-status.upcoming .dot {
  background: #eab308 !important;
  background-color: #eab308 !important;
  box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.28) !important;
}
[data-admin-legacy] .att-status.complete .dot {
  background: #2563eb !important;
  background-color: #2563eb !important;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25) !important;
}

/* Participant Attendance List: table + user details side by side */
[data-admin-legacy] .main:has(.listp-layout) {
  min-width: 0 !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  box-sizing: border-box !important;
}
[data-admin-legacy] .listp-layout {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(0, 300px) !important;
  gap: 14px !important;
  align-items: start !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
[data-admin-legacy] .listp-layout > div {
  min-width: 0 !important;
  max-width: 100% !important;
}
[data-admin-legacy] .listp-table-wrap {
  min-width: 0 !important;
  max-width: 100% !important;
  width: 100% !important;
  overflow-x: auto !important;
  box-sizing: border-box !important;
}
[data-admin-legacy] .listp-table {
  width: 100% !important;
  min-width: 0 !important;
  table-layout: fixed !important;
}
[data-admin-legacy] .listp-table th,
[data-admin-legacy] .listp-table td {
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
}
[data-admin-legacy] .listp-table thead th,
[data-admin-legacy] .listp-table th {
  color: #1357C9 !important;
}
[data-admin-legacy] .listp-table .name-cell {
  min-width: 0 !important;
}
[data-admin-legacy] .listp-table .name-cell > span:last-child {
  min-width: 0 !important;
  overflow-wrap: anywhere !important;
}
[data-admin-legacy] .listp-detail,
[data-admin-legacy] #listp-detail {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  position: sticky !important;
  top: 16px !important;
}
/* Wider detail panel only when sidebar is collapsed */
[data-admin-legacy] .app.sidebar-collapsed .listp-layout {
  grid-template-columns: minmax(0, 1fr) minmax(0, 360px) !important;
  gap: 18px !important;
}
@media (max-width: 1100px) {
  [data-admin-legacy] .listp-layout,
  [data-admin-legacy] .app.sidebar-collapsed .listp-layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 260px) !important;
    gap: 12px !important;
  }
}
@media (max-width: 900px) {
  [data-admin-legacy] .listp-layout,
  [data-admin-legacy] .app.sidebar-collapsed .listp-layout {
    grid-template-columns: 1fr !important;
  }
  [data-admin-legacy] .listp-detail {
    position: static !important;
  }
}

/* Participant details (info30): widen Personal / Event / Attendance cards */
[data-admin-legacy] .info-cols {
  display: grid !important;
  grid-template-columns: minmax(0, 2.7fr) minmax(220px, 0.62fr) !important;
  gap: 14px !important;
  width: 100% !important;
  align-items: start !important;
}
[data-admin-legacy] .info-col-main > #personal-info-card,
[data-admin-legacy] .info-col-main > #admin-event-summary,
[data-admin-legacy] .info-col-main > #participant-event-summary,
[data-admin-legacy] .info-col-main > #participant-attendance-summary,
[data-admin-legacy] .info-col-main > #participant-ai-insights,
[data-admin-legacy] .info-col-main > .info-card {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* Attendance Summary — match Event Summary card colors (no hover) */
[data-admin-legacy] #participant-attendance-summary .stat-tile,
[data-admin-legacy] #participant-attendance-summary a.stat-tile {
  background: #ffffff !important;
  border: 1px solid rgba(68, 138, 255, 0.22) !important;
  border-radius: 12px !important;
  box-shadow: none !important;
  transition: none !important;
  cursor: default !important;
  transform: none !important;
}
[data-admin-legacy] #participant-attendance-summary .stat-tile .stat-label {
  color: #475569 !important;
}
[data-admin-legacy] #participant-attendance-summary .stat-tile .stat-value {
  color: #334155 !important;
}
[data-admin-legacy] #participant-attendance-summary .stat-tile:hover,
[data-admin-legacy] #participant-attendance-summary a.stat-tile:hover {
  background: #ffffff !important;
  border-color: rgba(68, 138, 255, 0.22) !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-legacy] #participant-attendance-summary .stat-tile:hover .stat-label {
  color: #475569 !important;
}
[data-admin-legacy] #participant-attendance-summary .stat-tile:hover .stat-value {
  color: #334155 !important;
}

/* AI Insights card under Attendance Summary */
[data-admin-legacy] #participant-ai-insights.info-card {
  background: #ffffff !important;
  border: 1px solid rgba(68, 138, 255, 0.16) !important;
  border-radius: 14px !important;
  box-shadow: 0 2px 10px rgba(68, 138, 255, 0.08) !important;
  padding: 18px 20px 20px !important;
  transform: none !important;
}
[data-admin-legacy] #participant-ai-insights:hover {
  transform: none !important;
  box-shadow: 0 2px 10px rgba(68, 138, 255, 0.08) !important;
}
[data-admin-legacy] #participant-ai-insights .ai-insights-head {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin-bottom: 16px !important;
}
[data-admin-legacy] #participant-ai-insights .ai-insights-head h3,
[data-admin-legacy] #participant-ai-insights h3 {
  margin: 0 !important;
  color: #448aff !important;
  font-size: 18px !important;
  font-weight: 650 !important;
}
[data-admin-legacy] #participant-ai-insights .insight-gauges {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 12px !important;
  margin-bottom: 16px !important;
}
[data-admin-legacy] #participant-ai-insights .ring {
  width: 104px !important;
  height: 104px !important;
  border-radius: 50% !important;
  display: grid !important;
  place-items: center !important;
  background:
    radial-gradient(circle at center, #fff 0 58%, transparent 59%),
    conic-gradient(#448aff 0 95%, #c9dbff 95% 100%) !important;
}
[data-admin-legacy] #participant-ai-insights .ring.score {
  background:
    radial-gradient(circle at center, #fff 0 58%, transparent 59%),
    conic-gradient(#448aff 0 90%, #c9dbff 90% 100%) !important;
}
[data-admin-legacy] #participant-ai-insights .ring.ok {
  background:
    radial-gradient(circle at center, #fff 0 58%, transparent 59%),
    conic-gradient(#b8f0c4 0 100%, #b8f0c4 100%) !important;
}
[data-admin-legacy] #participant-ai-insights .ring span {
  color: #448aff !important;
  font-size: 18px !important;
  font-weight: 700 !important;
}
[data-admin-legacy] #participant-ai-insights .ring.ok span {
  color: #1e293b !important;
  font-size: 16px !important;
}
[data-admin-legacy] #participant-ai-insights .insight-box {
  background: #e8f0fe !important;
  border: none !important;
  border-radius: 12px !important;
  padding: 14px 16px !important;
}
[data-admin-legacy] #participant-ai-insights .insight-box strong {
  display: block !important;
  color: #448aff !important;
  margin-bottom: 6px !important;
}
[data-admin-legacy] #participant-ai-insights .insight-box p {
  margin: 0 !important;
  color: #334155 !important;
}
@media (max-width: 1200px) {
  [data-admin-legacy] .info-cols {
    grid-template-columns: minmax(0, 2.2fr) minmax(220px, 0.75fr) !important;
  }
}
@media (max-width: 1100px) {
  [data-admin-legacy] .info-cols {
    grid-template-columns: 1fr !important;
  }
}

/* Manage schools: cards fill width when sidebar is collapsed */
[data-admin-legacy] .school-grid {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
}
[data-admin-legacy] .app.sidebar-collapsed .school-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  width: 100% !important;
  gap: 16px !important;
}
[data-admin-legacy] .app.sidebar-collapsed .school-card,
[data-admin-legacy] .app.sidebar-collapsed a.school-card {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
}
@media (max-width: 1400px) {
  [data-admin-legacy] .app.sidebar-collapsed .school-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}

/* manages28 — square/portrait school cards + hide Filter */
[data-admin-page="manages28"] .filter-btn,
[data-admin-page="manages28"] button.filter-btn {
  display: none !important;
}
[data-admin-page="manages28"] .school-grid {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 16px !important;
  align-items: stretch !important;
}
[data-admin-page="manages28"] .school-card,
[data-admin-page="manages28"] a.school-card {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  aspect-ratio: 1 / 1.12 !important;
  width: 100% !important;
  min-height: 0 !important;
  height: auto !important;
  padding: 18px 14px !important;
  box-sizing: border-box !important;
}
[data-admin-page="manages28"] .school-card .badge,
[data-admin-page="manages28"] .school-card svg.badge {
  width: 64px !important;
  height: 84px !important;
  margin: 0 0 8px !important;
}
@media (max-width: 1100px) {
  [data-admin-page="manages28"] .school-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}
@media (max-width: 820px) {
  [data-admin-page="manages28"] .school-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

/* Users Recent Activity — match dashboard Newly Submitted panel */
/* Users Recent Activity — title outside card */
[data-admin-legacy] .section-head-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
  margin: 8px 0 12px !important;
}
[data-admin-legacy] .section-head-row h2 {
  margin: 0 !important;
  font-size: 22px !important;
  font-weight: 700 !important;
  color: #000 !important;
  text-shadow: none !important;
}
[data-admin-legacy] .section-head-row .filter-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  height: 32px !important;
  padding: 0 12px !important;
  background: #fff !important;
  border: 1.5px solid #448aff !important;
  border-radius: 8px !important;
  color: #448aff !important;
  font-weight: 600 !important;
}
/* user27 Manage Users cards — Figma */
[data-admin-legacy][data-admin-page="user27"] .manage-grid {
  gap: 18px !important;
  margin-top: 14px !important;
  margin-bottom: 32px !important;
  align-items: stretch !important;
}
[data-admin-legacy][data-admin-page="user27"] .manage-card {
  min-height: 220px !important;
  padding: 28px 20px 24px !important;
  border: 1px solid rgba(68, 138, 255, 0.16) !important;
  border-radius: 16px !important;
  box-shadow: 0 2px 10px rgba(68, 138, 255, 0.08) !important;
  background: #fff !important;
  gap: 14px !important;
  justify-content: center !important;
}
[data-admin-legacy][data-admin-page="user27"] .manage-card:hover {
  background: #fff !important;
  border-color: rgba(68, 138, 255, 0.28) !important;
  box-shadow: 0 6px 18px rgba(68, 138, 255, 0.12) !important;
  transform: translateY(-1px) !important;
}
[data-admin-legacy][data-admin-page="user27"] .manage-card .icon,
[data-admin-legacy][data-admin-page="user27"] .manage-card svg.icon {
  width: 52px !important;
  height: 52px !important;
  max-width: 52px !important;
  max-height: 52px !important;
  margin: 0 0 2px !important;
}
[data-admin-legacy][data-admin-page="user27"] .manage-card h3 {
  font-family: "Poppins", "Montserrat", sans-serif !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  color: #1a1a1a !important;
  letter-spacing: -0.02em !important;
  line-height: 1.25 !important;
  max-width: 11em !important;
}
[data-admin-legacy][data-admin-page="user27"] .manage-card .cta {
  min-width: 112px !important;
  height: 36px !important;
  margin-top: 8px !important;
  padding: 0 22px !important;
  border: none !important;
  border-radius: 999px !important;
  background: #448aff !important;
  color: #fff !important;
  font-family: "Montserrat", "Poppins", sans-serif !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  box-shadow: 0 4px 10px rgba(19, 87, 201, 0.28) !important;
}
[data-admin-legacy][data-admin-page="user27"] .manage-card .cta:hover {
  background: #3476e3 !important;
  color: #fff !important;
}
[data-admin-legacy] .users-table-panel .panel-head {
  display: none !important;
}
[data-admin-legacy] .users-table-panel.panel-box,
[data-admin-legacy] .users-table-panel {
  background: #ffffff !important;
  border: 1px solid rgba(68, 138, 255, 0.16) !important;
  border-radius: 14px !important;
  box-shadow: 0 4px 18px rgba(68, 138, 255, 0.1) !important;
  padding: 14px 18px !important;
  overflow: hidden !important;
}
[data-admin-legacy] .users-table-panel .panel-head.panel-head-filter-only {
  display: none !important;
}
[data-admin-legacy] .users-table-panel .activity-trigger {
  display: none !important;
}
[data-admin-legacy] .users-table-panel .filter-btn {
  background: #fff !important;
  border: 1.5px solid #448aff !important;
  border-radius: 8px !important;
  color: #448aff !important;
  font-weight: 600 !important;
}
[data-admin-legacy] .users-table-panel thead th {
  background: #f3f8ff !important;
  color: #1357c9 !important;
  border-bottom: 1px solid rgba(68, 138, 255, 0.16) !important;
  text-align: left !important;
  padding: 12px 14px !important;
  vertical-align: middle !important;
}
[data-admin-legacy] .users-table-panel tbody td {
  color: #374151 !important;
  border-bottom: 1px solid rgba(68, 138, 255, 0.1) !important;
  background: #fff !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  line-height: 1.45 !important;
  text-align: left !important;
  padding: 12px 14px !important;
  vertical-align: middle !important;
}
[data-admin-legacy] .users-table-panel thead th:nth-child(1),
[data-admin-legacy] .users-table-panel tbody td:nth-child(1),
[data-admin-legacy] .users-table-panel thead th:nth-child(4),
[data-admin-legacy] .users-table-panel tbody td:nth-child(4),
[data-admin-legacy] .users-table-panel thead th:nth-child(6),
[data-admin-legacy] .users-table-panel tbody td:nth-child(6) {
  text-align: center !important;
}
[data-admin-legacy] .users-table-panel table {
  table-layout: fixed !important;
  width: 100% !important;
}
[data-admin-legacy] .users-table-panel tbody tr:hover td {
  background: rgba(68, 138, 255, 0.03) !important;
}
[data-admin-legacy] .users-table-panel .view-btn {
  background: rgba(68, 138, 255, 0.12) !important;
  border: 1px solid rgba(68, 138, 255, 0.35) !important;
  color: #448aff !important;
  border-radius: 8px !important;
  font-weight: 600 !important;
}
[data-admin-legacy] #recent-activities tbody td,
[data-admin-legacy] .panel-box tbody td,
[data-admin-legacy] .activity-panel tbody td {
  font-size: 14px !important;
  font-weight: 400 !important;
  color: #374151 !important;
  line-height: 1.45 !important;
}
[data-admin-legacy] .users-table-panel .sort-btn,
[data-admin-legacy] .users-table-panel .pager button {
  background: #fff !important;
  border: 1.5px solid #448aff !important;
  border-radius: 8px !important;
  color: #448aff !important;
}
[data-admin-legacy] .users-table-panel .pager {
  color: #448aff !important;
}

/* Participant list (listp44): Ascending / Descending — Figma outline buttons */
[data-admin-legacy] .listp-sort {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  height: auto !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
[data-admin-legacy] .listp-sort button,
[data-admin-legacy] .listp-sort button[data-sort] {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  height: 22px !important;
  min-height: 22px !important;
  padding: 0 8px !important;
  background: #ffffff !important;
  border: 1px solid #448aff !important;
  border-radius: 5px !important;
  color: #448aff !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  cursor: pointer !important;
  box-shadow: none !important;
}
[data-admin-legacy] .listp-sort button .sort-arrow {
  font-size: 10px !important;
  line-height: 1 !important;
}
[data-admin-legacy] .listp-sort button:hover,
[data-admin-legacy] .listp-sort button.active {
  background: #ffffff !important;
  border-color: #448aff !important;
  color: #448aff !important;
}
[data-admin-legacy] .listp-footer {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  justify-content: flex-start !important;
  margin-top: 8px !important;
  gap: 12px !important;
  max-width: 100% !important;
  overflow-x: auto !important;
  white-space: nowrap !important;
}
[data-admin-legacy] .listp-pager {
  display: inline-flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 6px !important;
  white-space: nowrap !important;
  max-width: 100% !important;
  overflow-x: auto !important;
  margin-left: 28px !important;
}
[data-admin-legacy] .listp-show,
[data-admin-legacy] .listp-page {
  display: inline-flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 4px !important;
  white-space: nowrap !important;
  color: #448aff !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 11px !important;
  font-weight: 500 !important;
}
[data-admin-legacy] .listp-show span,
[data-admin-legacy] .listp-page span {
  font-size: 11px !important;
  color: #448aff !important;
  white-space: nowrap !important;
}
[data-admin-legacy] .listp-show .stepper,
[data-admin-legacy] .listp-page .nav-btn {
  display: inline-grid !important;
  place-items: center !important;
  width: 20px !important;
  height: 20px !important;
  min-width: 20px !important;
  padding: 0 !important;
  border: 1px solid rgba(68, 138, 255, 0.35) !important;
  border-radius: 4px !important;
  color: #448aff !important;
  background: #fff !important;
  font-size: 12px !important;
  line-height: 1 !important;
}
[data-admin-legacy] .listp-show .count {
  min-width: 18px !important;
  height: 20px !important;
  display: inline-grid !important;
  place-items: center !important;
  padding: 0 4px !important;
  border: 1px solid rgba(68, 138, 255, 0.35) !important;
  border-radius: 4px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #448aff !important;
  background: #fff !important;
}

/* Events Registered card footer — Figma outline Asc/Desc + Show entries */
[data-admin-legacy] .ereg-sort {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  height: auto !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
[data-admin-legacy] .ereg-sort > span,
[data-admin-legacy] .ereg-sort > .active,
[data-admin-legacy] .ereg-sort button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 12px !important;
  background: #ffffff !important;
  border: 1px solid #448aff !important;
  border-radius: 6px !important;
  color: #448aff !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
}
[data-admin-legacy] .ereg-pager {
  display: inline-flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 12px !important;
  color: #448aff !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 14px !important;
  font-weight: 500 !important;
}
[data-admin-legacy] .ereg-pager .show-ctrl {
  display: contents !important;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  height: auto !important;
}
[data-admin-legacy] .ereg-pager .show-entries,
[data-admin-legacy] .ereg-pager .page-label {
  color: #448aff !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
}
[data-admin-legacy] .ereg-pager .nav-btn {
  display: inline-grid !important;
  place-items: center !important;
  width: 32px !important;
  height: 32px !important;
  min-width: 32px !important;
  padding: 0 !important;
  background: #ffffff !important;
  border: 1.5px solid #448aff !important;
  border-radius: 6px !important;
  color: #448aff !important;
  font-size: 18px !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  cursor: pointer !important;
}
[data-admin-legacy] .ereg-pager .nav-btn:hover {
  background: #f3f8ff !important;
  border-color: #448aff !important;
  color: #448aff !important;
}

/* Events Registered card — compact + inner card padding (not page margins) */
[data-admin-legacy] .ereg-panel {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 14px 18px 16px !important;
  box-sizing: border-box !important;
  overflow: visible !important;
}
[data-admin-legacy] .ereg-panel-head {
  padding: 0 0 10px !important;
}
[data-admin-legacy] .ereg-panel-head h2 {
  font-size: 16px !important;
}
[data-admin-legacy] .ereg-table-wrap {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: auto !important;
  border-radius: 8px !important;
}
[data-admin-legacy] .ereg-table {
  width: 100% !important;
  min-width: 0 !important;
  table-layout: fixed !important;
}
[data-admin-legacy] .ereg-table thead th {
  padding: 8px 10px !important;
  font-size: 10px !important;
  white-space: nowrap !important;
}
[data-admin-legacy] .ereg-table thead th:first-child {
  padding-left: 12px !important;
  border-radius: 8px 0 0 0 !important;
}
[data-admin-legacy] .ereg-table thead th:last-child {
  padding-right: 12px !important;
  border-radius: 0 8px 0 0 !important;
}
[data-admin-legacy] .ereg-table tbody td {
  padding: 8px 10px !important;
  font-size: 11px !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
}
[data-admin-legacy] .ereg-table tbody td:first-child {
  padding-left: 12px !important;
}
[data-admin-legacy] .ereg-table tbody td:last-child {
  padding-right: 12px !important;
}
[data-admin-legacy] .ereg-view {
  min-width: 52px !important;
  height: 26px !important;
  padding: 0 8px !important;
  font-size: 11px !important;
}
[data-admin-legacy] .ereg-footer {
  padding: 12px 0 0 !important;
  gap: 8px 12px !important;
}
[data-admin-legacy] .ereg-pager {
  gap: 8px !important;
  font-size: 12px !important;
}
[data-admin-legacy] .ereg-pager .show-entries,
[data-admin-legacy] .ereg-pager .page-label {
  font-size: 12px !important;
}
[data-admin-legacy] .ereg-pager .nav-btn {
  width: 26px !important;
  height: 26px !important;
  min-width: 26px !important;
  font-size: 14px !important;
}

/* Events list title dropdown (Registered / Attended / ...) */
[data-admin-legacy] .ereg-panel-head {
  position: relative !important;
  z-index: 5 !important;
}
[data-admin-legacy] .ereg-view-select {
  position: relative !important;
  display: inline-block !important;
}
[data-admin-legacy] .ereg-view-trigger {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 16px !important;
  font-weight: 650 !important;
  color: #448aff !important;
}
[data-admin-legacy] .ereg-view-label,
[data-admin-legacy] .ereg-view-chevron {
  color: #448aff !important;
}
[data-admin-legacy] .ereg-view-chevron {
  width: 16px !important;
  height: 16px !important;
  transition: transform 0.15s ease !important;
}
[data-admin-legacy] .ereg-view-select.is-open .ereg-view-chevron {
  transform: rotate(180deg) !important;
}
[data-admin-legacy] .ereg-view-menu {
  position: absolute !important;
  top: calc(100% + 8px) !important;
  left: 0 !important;
  min-width: 220px !important;
  padding: 6px !important;
  background: #fff !important;
  border: 1px solid rgba(68, 138, 255, 0.22) !important;
  border-radius: 10px !important;
  box-shadow: 0 10px 28px rgba(68, 138, 255, 0.16) !important;
  z-index: 50 !important;
}
[data-admin-legacy] .ereg-view-menu[hidden] {
  display: none !important;
}
[data-admin-legacy] .ereg-view-menu a {
  display: block !important;
  padding: 10px 12px !important;
  border-radius: 8px !important;
  color: #334155 !important;
  text-decoration: none !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 13px !important;
  font-weight: 500 !important;
}
[data-admin-legacy] .ereg-view-menu a:hover,
[data-admin-legacy] .ereg-view-menu a.active {
  background: #f3f8ff !important;
  color: #448aff !important;
}
[data-admin-legacy] .ereg-view-menu a.active {
  font-weight: 600 !important;
  background: rgba(68, 138, 255, 0.12) !important;
}

/* Sidebar profile card — Figma hover */
[data-admin-legacy] .user-card,
[data-admin-legacy] button.user-card {
  position: relative !important;
  transition:
    background 0.22s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    color 0.22s ease !important;
}
[data-admin-legacy] .user-card .user-avatar,
[data-admin-legacy] button.user-card .user-avatar {
  transition: box-shadow 0.22s ease !important;
}
[data-admin-legacy] .user-card .chevron,
[data-admin-legacy] button.user-card .chevron {
  position: relative !important;
  z-index: 1 !important;
  flex-shrink: 0 !important;
  transition: color 0.22s ease !important;
}
[data-admin-legacy] .user-card:hover,
[data-admin-legacy] .user-card[aria-expanded="true"],
[data-admin-legacy] button.user-card:hover,
[data-admin-legacy] button.user-card[aria-expanded="true"] {
  background: #99c2ff !important;
  border-color: transparent !important;
  box-shadow: 0 4px 16px rgba(68, 138, 255, 0.28) !important;
  color: #fff !important;
  overflow: visible !important;
}
[data-admin-legacy] .user-card:hover .user-meta strong,
[data-admin-legacy] .user-card:hover .user-meta span,
[data-admin-legacy] .user-card[aria-expanded="true"] .user-meta strong,
[data-admin-legacy] .user-card[aria-expanded="true"] .user-meta span,
[data-admin-legacy] button.user-card:hover .user-meta strong,
[data-admin-legacy] button.user-card:hover .user-meta span,
[data-admin-legacy] button.user-card[aria-expanded="true"] .user-meta strong,
[data-admin-legacy] button.user-card[aria-expanded="true"] .user-meta span {
  color: #fff !important;
}
[data-admin-legacy] .user-card:hover .user-avatar,
[data-admin-legacy] .user-card[aria-expanded="true"] .user-avatar,
[data-admin-legacy] button.user-card:hover .user-avatar,
[data-admin-legacy] button.user-card[aria-expanded="true"] .user-avatar {
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.45),
    0 0 18px 8px rgba(255, 255, 255, 0.75),
    0 0 28px 12px rgba(255, 255, 255, 0.35) !important;
}
[data-admin-legacy] .user-card:hover::after,
[data-admin-legacy] .user-card[aria-expanded="true"]::after,
[data-admin-legacy] button.user-card:hover::after,
[data-admin-legacy] button.user-card[aria-expanded="true"]::after {
  content: none !important;
  display: none !important;
}
[data-admin-legacy] .user-card:hover .chevron,
[data-admin-legacy] .user-card[aria-expanded="true"] .chevron,
[data-admin-legacy] button.user-card:hover .chevron,
[data-admin-legacy] button.user-card[aria-expanded="true"] .chevron {
  color: #fff !important;
  background: none !important;
  box-shadow: none !important;
  filter: none !important;
  padding: 0 !important;
}

/* Hide native browser password-reveal (Edge/IE) — keep custom eye only */
[data-admin-legacy] input[type="password"]::-ms-reveal,
[data-admin-legacy] input[type="password"]::-ms-clear,
[data-admin-page="acc05"] input[type="password"]::-ms-reveal,
[data-admin-page="acc05"] input[type="password"]::-ms-clear {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
[data-admin-legacy] input[type="password"]::-webkit-credentials-auto-fill-button,
[data-admin-legacy] input[type="password"]::-webkit-strong-password-auto-fill-button {
  visibility: hidden !important;
  pointer-events: none !important;
  position: absolute !important;
  right: 0 !important;
  display: none !important;
}

/* Password eye toggle — ensure clickable above the input */
[data-admin-legacy] .input-wrap {
  position: relative !important;
}
[data-admin-legacy] .input-wrap .icon-right,
[data-admin-legacy] .input-wrap #toggle-password,
[data-admin-legacy] .input-wrap .toggle-password,
[data-admin-legacy] .input-wrap button.toggle-password {
  pointer-events: auto !important;
  cursor: pointer !important;
  z-index: 5 !important;
  width: 28px !important;
  height: 28px !important;
  right: 10px !important;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  display: grid !important;
  place-items: center !important;
  color: #9aa3ad !important;
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
[data-admin-legacy] .input-wrap .icon-right svg,
[data-admin-legacy] .input-wrap #toggle-password svg,
[data-admin-legacy] .input-wrap .toggle-password svg {
  width: 18px !important;
  height: 18px !important;
  display: block !important;
  pointer-events: none !important;
}

/* acc05 — bordered wrap so eye sits inside the box */
[data-admin-page="acc05"] .panel .field .input-wrap {
  display: block !important;
  height: 44px !important;
  border: 1.5px solid #448aff !important;
  border-radius: 6px !important;
  background: #ffffff !important;
  box-sizing: border-box !important;
}
[data-admin-page="acc05"] .panel .field .input-wrap input {
  border: none !important;
  box-shadow: none !important;
  height: 100% !important;
  padding: 0 44px 0 14px !important;
  background: transparent !important;
}
[data-admin-page="acc05"] .panel .field .input-wrap:focus-within {
  box-shadow: 0 0 0 3px rgba(68, 138, 255, 0.12) !important;
}

/* aed15 / live16 / cc19 — Figma information card header + grid */
[data-admin-page="aed15"] #event-info-card .approved-figma-top,
[data-admin-page="aed15"] #event-info-card .detail-top,
[data-admin-page="live16"] #event-info-card .approved-figma-top,
[data-admin-page="live16"] #event-info-card .detail-top,
[data-admin-page="cc19"] #event-info-card .approved-figma-top,
[data-admin-page="cc19"] #event-info-card .detail-top {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 220px !important;
  align-items: start !important;
  gap: 18px 28px !important;
}
[data-admin-page="aed15"] #event-info-card .detail-top-main h3,
[data-admin-page="live16"] #event-info-card .detail-top-main h3,
[data-admin-page="cc19"] #event-info-card .detail-top-main h3 {
  color: #448aff !important;
  font-size: 28px !important;
  font-weight: 700 !important;
}
[data-admin-page="aed15"] #event-info-card .detail-top-main .submission-date-label,
[data-admin-page="live16"] #event-info-card .detail-top-main .submission-date-label,
[data-admin-page="cc19"] #event-info-card .detail-top-main .submission-date-label {
  display: block !important;
  color: #7aa6ff !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  text-align: left !important;
  margin: 0 0 10px !important;
  letter-spacing: 0.04em !important;
  line-height: 1.2 !important;
}
[data-admin-page="aed15"] #event-info-card .detail-top-aside,
[data-admin-page="live16"] #event-info-card .detail-top-aside,
[data-admin-page="cc19"] #event-info-card .detail-top-aside {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  gap: 6px !important;
}
[data-admin-page="aed15"] #event-info-card .approved-date-label,
[data-admin-page="live16"] #event-info-card .approved-date-label,
[data-admin-page="cc19"] #event-info-card .approved-date-label {
  display: block !important;
  color: #0f172a !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  text-align: right !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
}
[data-admin-page="aed15"] #event-info-card .approved-by-link,
[data-admin-page="live16"] #event-info-card .approved-by-link,
[data-admin-page="cc19"] #event-info-card .approved-by-link {
  display: block !important;
  color: #448aff !important;
  font-size: 12px !important;
  font-style: italic !important;
  font-weight: 600 !important;
  text-align: right !important;
  text-decoration: none !important;
  margin: 0 0 8px !important;
}
[data-admin-page="aed15"] #event-info-card .poster,
[data-admin-page="aed15"] #event-info-card .detail-top-aside .poster,
[data-admin-page="live16"] #event-info-card .poster,
[data-admin-page="live16"] #event-info-card .detail-top-aside .poster,
[data-admin-page="cc19"] #event-info-card .poster,
[data-admin-page="cc19"] #event-info-card .detail-top-aside .poster {
  display: block !important;
  width: 220px !important;
  height: 124px !important;
  border-radius: 12px !important;
  margin: 0 !important;
  background: linear-gradient(145deg, #7eb6ff 0%, #448aff 48%, #3476e3 100%) !important;
  background-image: linear-gradient(145deg, #7eb6ff 0%, #448aff 48%, #3476e3 100%) !important;
  border: none !important;
  overflow: hidden !important;
  box-shadow: none !important;
}
[data-admin-page="aed15"] #event-info-card .poster img,
[data-admin-page="aed15"] #event-info-card .detail-top-aside .poster img,
[data-admin-page="live16"] #event-info-card .poster img,
[data-admin-page="cc19"] #event-info-card .poster img,
[data-admin-page="edetails14"] #event-info-card .poster img,
[data-admin-page="cc19"] #event-info-card .detail-top-aside .poster img {
  display: none !important;
}
[data-admin-page="aed15"] #event-info-card .figma-event-meta,
[data-admin-page="aed15"] #event-info-card .approved-status,
[data-admin-page="aed15"] #event-info-card .event-source-tags,
[data-admin-page="live16"] #event-info-card .figma-event-meta,
[data-admin-page="live16"] #event-info-card .approved-status,
[data-admin-page="live16"] #event-info-card .event-source-tags,
[data-admin-page="cc19"] #event-info-card .figma-event-meta,
[data-admin-page="cc19"] #event-info-card .approved-status,
[data-admin-page="cc19"] #event-info-card .event-source-tags {
  display: none !important;
}
[data-admin-page="aed15"] #event-info-card .info-grid-figma,
[data-admin-page="live16"] #event-info-card .info-grid-figma,
[data-admin-page="cc19"] #event-info-card .info-grid-figma {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 12px !important;
}
[data-admin-page="aed15"] #event-info-card .info-grid-figma .field-box,
[data-admin-page="live16"] #event-info-card .info-grid-figma .field-box,
[data-admin-page="cc19"] #event-info-card .info-grid-figma .field-box {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  min-height: 88px !important;
  padding: 28px 10px 14px !important;
  background: #f3f8ff !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  border-radius: 12px !important;
  justify-content: center !important;
  align-items: center !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-page="aed15"] #event-info-card .info-grid-figma .field-box .label,
[data-admin-page="live16"] #event-info-card .info-grid-figma .field-box .label,
[data-admin-page="cc19"] #event-info-card .info-grid-figma .field-box .label {
  position: absolute !important;
  top: 10px !important;
  left: 12px !important;
  text-align: left !important;
  color: #64748b !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
}
[data-admin-page="aed15"] #event-info-card .info-grid-figma .field-box .value,
[data-admin-page="live16"] #event-info-card .info-grid-figma .field-box .value,
[data-admin-page="cc19"] #event-info-card .info-grid-figma .field-box .value {
  text-align: center !important;
  color: #0f172a !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
}

/* aed15 / live16 / cc19 — Participants & Collaborators Figma cards */
[data-admin-page="aed15"] #event-info-card .participants-collab-grid,
[data-admin-page="live16"] #event-info-card .participants-collab-grid,
[data-admin-page="cc19"] #event-info-card .participants-collab-grid {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 12px !important;
}
[data-admin-page="aed15"] #event-info-card .participants-collab-grid .field-box,
[data-admin-page="live16"] #event-info-card .participants-collab-grid .field-box,
[data-admin-page="cc19"] #event-info-card .participants-collab-grid .field-box {
  position: static !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: flex-start !important;
  gap: 10px !important;
  min-height: 92px !important;
  padding: 12px 14px 14px !important;
  background: #ffffff !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  border-radius: 10px !important;
  text-align: left !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-page="aed15"] #event-info-card .participants-collab-grid .field-box .label,
[data-admin-page="live16"] #event-info-card .participants-collab-grid .field-box .label,
[data-admin-page="cc19"] #event-info-card .participants-collab-grid .field-box .label {
  position: static !important;
  top: auto !important;
  left: auto !important;
  text-align: left !important;
  color: #64748b !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
}
[data-admin-page="aed15"] #event-info-card .participants-collab-grid .field-box .value,
[data-admin-page="live16"] #event-info-card .participants-collab-grid .field-box .value,
[data-admin-page="cc19"] #event-info-card .participants-collab-grid .field-box .value {
  text-align: left !important;
  color: #0f172a !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  line-height: 1.35 !important;
}

/* edetails14 pending — information card with submission date + blue poster */
[data-admin-page="edetails14"] #event-info-card .detail-top,
[data-admin-page="edetails14"] #event-info-card .figma-detail-top {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 200px !important;
  align-items: start !important;
  gap: 20px 28px !important;
}
[data-admin-page="edetails14"] #event-info-card .detail-top-main h3 {
  color: #448aff !important;
  font-size: 28px !important;
  font-weight: 700 !important;
}
[data-admin-page="edetails14"] #event-info-card .detail-top-main .desc {
  color: #0f172a !important;
}
[data-admin-page="edetails14"] #event-info-card .detail-top-aside {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  gap: 0 !important;
  width: 100% !important;
  max-width: 200px !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}
[data-admin-page="edetails14"] #event-info-card .detail-top-aside .submission-date-label,
[data-admin-page="edetails14"] #event-info-card .submission-date-label {
  display: block !important;
  color: #448aff !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  text-align: right !important;
  margin: 0 0 12px !important;
  padding: 0 !important;
  line-height: 1.2 !important;
}
[data-admin-page="edetails14"] #event-info-card .pending-status-label,
[data-admin-page="edetails14"] #event-info-card .view-event-link {
  display: none !important;
}
[data-admin-page="edetails14"] #event-info-card .poster,
[data-admin-page="edetails14"] #event-info-card .detail-top .poster,
[data-admin-page="edetails14"] #event-info-card .detail-top-aside .poster {
  display: block !important;
  width: 100% !important;
  max-width: 200px !important;
  height: 112px !important;
  margin: 0 !important;
  border-radius: 12px !important;
  background: linear-gradient(145deg, #7eb6ff 0%, #448aff 48%, #3476e3 100%) !important;
  background-image: linear-gradient(145deg, #7eb6ff 0%, #448aff 48%, #3476e3 100%) !important;
  border: none !important;
  box-sizing: border-box !important;
}
[data-admin-page="edetails14"] #event-info-card .approved-status,
[data-admin-page="edetails14"] #event-info-card .event-source-tags,
[data-admin-page="edetails14"] #event-info-card .figma-event-meta {
  display: none !important;
}
[data-admin-page="edetails14"] #event-info-card .info-grid-figma {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 12px !important;
}
[data-admin-page="edetails14"] #event-info-card .info-grid-figma .field-box {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  min-height: 88px !important;
  padding: 28px 10px 14px !important;
  background: #f3f8ff !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  border-radius: 12px !important;
  justify-content: center !important;
  align-items: center !important;
  box-shadow: none !important;
  transform: none !important;
}
[data-admin-page="edetails14"] #event-info-card .info-grid-figma .field-box .label {
  position: absolute !important;
  top: 10px !important;
  left: 12px !important;
  text-align: left !important;
  color: #64748b !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
}
[data-admin-page="edetails14"] #event-info-card .info-grid-figma .field-box .value {
  text-align: center !important;
  color: #0f172a !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
}

/* edetails14 — submitted-by soft border (match event information card) */
[data-admin-page="edetails14"] .detail-card.submitted-by-card {
  border: 1px solid rgba(68, 138, 255, 0.2) !important;
  border-radius: 14px !important;
  box-shadow: 0 4px 18px rgba(68, 138, 255, 0.08) !important;
}

/* edetails14 — Participants & Collaborators Figma cards */
[data-admin-page="edetails14"] #event-info-card .participants-collab-grid {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 12px !important;
}
[data-admin-page="edetails14"] #event-info-card .participants-collab-grid .field-box {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: flex-start !important;
  gap: 10px !important;
  min-height: 92px !important;
  padding: 12px 14px 14px !important;
  background: #ffffff !important;
  border: 1px solid rgba(68, 138, 255, 0.28) !important;
  border-radius: 10px !important;
  text-align: left !important;
}
[data-admin-page="edetails14"] #event-info-card .participants-collab-grid .field-box .label {
  position: static !important;
  text-align: left !important;
  color: #64748b !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
}
[data-admin-page="edetails14"] #event-info-card .participants-collab-grid .field-box .value {
  text-align: left !important;
  color: #0f172a !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  line-height: 1.35 !important;
}

/* rfid17 — compact scanned profile card (beat global 560px RFID rule) */
[data-admin-page="rfid17"] aside.profile-card[aria-label="Scanned participant"],
[data-admin-page="rfid17"] body:has(.tap-panel) .profile-card,
[data-admin-page="rfid17"] .profile-card {
  min-height: 0 !important;
  height: auto !important;
  padding: 16px 14px 18px !important;
  overflow: hidden !important;
}
[data-admin-page="rfid17"] body:has(.tap-panel) .profile-card .avatar-wrap,
[data-admin-page="rfid17"] .profile-card .avatar-wrap,
[data-admin-page="rfid17"] .profile-card .avatar {
  width: 72px !important;
  height: 72px !important;
}
[data-admin-page="rfid17"] body:has(.tap-panel) .profile-card .avatar-wrap,
[data-admin-page="rfid17"] .profile-card .avatar-wrap {
  margin: 0 auto 10px !important;
  margin-bottom: 10px !important;
}
[data-admin-page="rfid17"] body:has(.tap-panel) .profile-card .profile-name,
[data-admin-page="rfid17"] .profile-card .profile-name {
  margin: 0 0 8px !important;
  padding: 0 !important;
  font-size: 14px !important;
}
[data-admin-page="rfid17"] body:has(.tap-panel) .profile-card .profile-meta,
[data-admin-page="rfid17"] .profile-card .profile-meta {
  gap: 4px !important;
  padding: 0 !important;
}
[data-admin-page="rfid17"] body:has(.tap-panel) .profile-card .profile-meta span,
[data-admin-page="rfid17"] .profile-card .profile-meta span {
  padding: 0 !important;
  margin: 0 !important;
  line-height: 1.25 !important;
  font-size: 12px !important;
}

/* ongoing16 — Happening Now heading black */
[data-admin-page="ongoing16"] .section-heading .heading-text {
  color: #000000 !important;
}

/* inactive20 — Rejected Events heading black */
[data-admin-page="inactive20"] .section-heading .heading-text {
  color: #000000 !important;
}

/* attendance42 — Month control Figma SVG */
[data-admin-page="attendance42"] .att-filters,
[data-admin-page="attendance42"] .att-page {
  overflow: visible !important;
}
[data-admin-page="attendance42"] .att-month-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 107px !important;
  height: 35px !important;
  padding: 0 !important;
  gap: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  transform: none !important;
}
[data-admin-page="attendance42"] .att-month-btn:hover,
[data-admin-page="attendance42"] .att-month-btn:focus-visible {
  transform: none !important;
  box-shadow: none !important;
  background: transparent !important;
}
[data-admin-page="attendance42"] .att-month-btn svg {
  display: block !important;
  width: 107px !important;
  height: 35px !important;
}
[data-admin-page="attendance42"] .att-month-btn svg > rect:first-child {
  stroke: #1357C9 !important;
  stroke-width: 1.2 !important;
}
[data-admin-legacy][data-admin-page="attendance42"] .att-month-menu {
  z-index: 80 !important;
}
[data-admin-legacy][data-admin-page="attendance42"] .att-course-menu,
[data-admin-legacy][data-admin-page="attendance42"] .att-org-menu {
  z-index: 80 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .toolbar-selects,
[data-admin-legacy][data-admin-page="cert45"] .toolbar-selects {
  overflow: visible !important;
  position: relative !important;
  z-index: 50 !important;
}
[data-admin-legacy][data-admin-page="feedback47"] .fb47-dd-menu,
[data-admin-legacy][data-admin-page="cert45"] .cert-dd-menu {
  z-index: 90 !important;
}
[data-admin-page="attendance42"] .att-month-wrap {
  position: relative !important;
  display: inline-flex !important;
  z-index: 30 !important;
}
[data-admin-page="attendance42"] .att-month-menu {
  position: absolute !important;
  top: calc(100% + 6px) !important;
  left: 0 !important;
  min-width: 168px !important;
  max-height: 280px !important;
  overflow: auto !important;
  padding: 8px !important;
  background: #fff !important;
  border: 1px solid rgba(19, 87, 201, 0.22) !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(19, 87, 201, 0.12) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  z-index: 40 !important;
}
[data-admin-page="attendance42"] .att-month-menu[hidden] {
  display: none !important;
}
[data-admin-page="attendance42"] .att-month-menu-year {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  padding: 4px 4px 8px !important;
  border-bottom: 1px solid rgba(68, 138, 255, 0.16) !important;
  margin-bottom: 6px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: #1357C9 !important;
}
[data-admin-page="attendance42"] .att-month-menu-year button {
  width: 24px !important;
  height: 24px !important;
  border: none !important;
  border-radius: 6px !important;
  background: rgba(68, 138, 255, 0.12) !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  font-size: 14px !important;
  line-height: 1 !important;
}
[data-admin-page="attendance42"] .att-month-option {
  border: none !important;
  background: transparent !important;
  text-align: left !important;
  padding: 8px 10px !important;
  border-radius: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #1357C9 !important;
  cursor: pointer !important;
}
[data-admin-page="attendance42"] .att-month-option:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-page="attendance42"] .att-month-option.is-active {
  background: rgba(68, 138, 255, 0.2) !important;
  font-weight: 600 !important;
}
[data-admin-page="attendance42"] .att-month-btn #att-month-label {
  fill: #1357C9 !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 500 !important;
}
[data-admin-page="attendance42"] .att-course-wrap {
  position: relative !important;
  display: inline-flex !important;
  z-index: 30 !important;
}
[data-admin-page="attendance42"] .att-course-wrap .att-select-label {
  max-width: 180px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
[data-admin-page="attendance42"] .att-course-menu {
  position: absolute !important;
  top: calc(100% + 6px) !important;
  right: 0 !important;
  left: auto !important;
  min-width: 280px !important;
  max-width: min(420px, 92vw) !important;
  max-height: 320px !important;
  overflow: auto !important;
  padding: 8px !important;
  background: #fff !important;
  border: 1px solid rgba(19, 87, 201, 0.22) !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(19, 87, 201, 0.12) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  z-index: 40 !important;
}
[data-admin-page="attendance42"] .att-course-menu[hidden] {
  display: none !important;
}
[data-admin-page="attendance42"] .att-course-option {
  border: none !important;
  background: transparent !important;
  text-align: left !important;
  padding: 8px 10px !important;
  border-radius: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  line-height: 1.35 !important;
}
[data-admin-page="attendance42"] .att-course-option.is-nested {
  padding-left: 22px !important;
  font-weight: 400 !important;
  color: #3476E3 !important;
}
[data-admin-page="attendance42"] .att-course-option:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-page="attendance42"] .att-course-option.is-active {
  background: rgba(68, 138, 255, 0.2) !important;
  font-weight: 600 !important;
}
[data-admin-page="attendance42"] .att-org-wrap {
  position: relative !important;
  display: inline-flex !important;
  z-index: 30 !important;
}
[data-admin-page="attendance42"] .att-org-wrap .att-select-label {
  max-width: 180px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
[data-admin-page="attendance42"] .att-org-menu {
  position: absolute !important;
  top: calc(100% + 6px) !important;
  left: 0 !important;
  right: auto !important;
  min-width: 300px !important;
  max-width: min(460px, 92vw) !important;
  max-height: 340px !important;
  overflow: auto !important;
  padding: 8px !important;
  background: #fff !important;
  border: 1px solid rgba(19, 87, 201, 0.22) !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(19, 87, 201, 0.12) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  z-index: 40 !important;
}
[data-admin-page="attendance42"] .att-org-menu[hidden] {
  display: none !important;
}
[data-admin-page="attendance42"] .att-org-section {
  margin: 6px 4px 4px !important;
  padding: 6px 6px 4px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  letter-spacing: 0.04em !important;
  color: #1357C9 !important;
  border-bottom: 1px solid rgba(68, 138, 255, 0.16) !important;
}
[data-admin-page="attendance42"] .att-org-section:first-child {
  margin-top: 0 !important;
}
[data-admin-page="attendance42"] .att-org-group {
  margin: 6px 4px 2px !important;
  padding: 4px 6px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  color: #3476E3 !important;
}
[data-admin-page="attendance42"] .att-org-option {
  border: none !important;
  background: transparent !important;
  text-align: left !important;
  padding: 8px 10px 8px 18px !important;
  border-radius: 8px !important;
  font-family: "Poppins", sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #1357C9 !important;
  cursor: pointer !important;
  line-height: 1.35 !important;
}
[data-admin-page="attendance42"] .att-org-option:hover {
  background: rgba(68, 138, 255, 0.12) !important;
}
[data-admin-page="attendance42"] .att-org-option.is-active {
  background: rgba(68, 138, 255, 0.2) !important;
  font-weight: 600 !important;
}

/* Admin login02 — forced spacing (gap controls label→input) */
[data-admin-page="login02"] .login-card h2#login-title,
[data-admin-page="login02"] .login-card h2 {
  margin: 0 0 24px !important;
}
[data-admin-page="login02"] .login-card .field {
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  margin-bottom: 16px !important;
}
[data-admin-page="login02"] .login-card .field label {
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1.2 !important;
}
[data-admin-page="login02"] .login-card .field:has(#password),
[data-admin-page="login02"] .login-card .field:has(input#password) {
  margin-bottom: 0 !important;
}
[data-admin-page="login02"] .login-card .forgot,
[data-admin-page="login02"] a.forgot {
  margin: 10px 0 16px !important;
}

/* selection01 — Admin role card */
[data-admin-page="selection01"] .roles {
  display: flex;
  justify-content: center;
  gap: 28px;
  flex-wrap: wrap;
}
[data-admin-page="selection01"] .role-card {
  cursor: pointer;
}
[data-admin-page="selection01"] .role-card.is-selected {
  outline: 2px solid #448aff;
  outline-offset: 4px;
}

/* Recent Account Activity (profile) — left-align title/table text */
[data-admin-page="profile"] .profile-panel--activity,
[data-admin-page="profile"] .profile-panel--activity h2,
[data-admin-page="profile"] .profile-panel--activity #recent-activity-title {
  text-align: left !important;
}
[data-admin-page="profile"] .profile-panel--activity .panel-rule {
  margin-left: 0 !important;
  margin-right: 0 !important;
}
[data-admin-page="profile"] .profile-panel--activity .activity-table th,
[data-admin-page="profile"] .profile-panel--activity .activity-table td {
  text-align: left !important;
  vertical-align: middle !important;
}
`,
        }}
      />
      <div dangerouslySetInnerHTML={{ __html: pageHtml }} />
    </div>
  );
}
