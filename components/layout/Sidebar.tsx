"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BOTTOM_NAV,
  getNavItemsForRole,
  isNavActive,
} from "@/lib/navigation";
import { NavIcon } from "@/components/layout/NavIcons";
import { useAuth } from "@/components/auth/AuthProvider";

const SIDEBAR_STORAGE_KEY = "dc_sidebar_collapsed";

function useSidebarCollapse() {
  useEffect(() => {
    const app = document.querySelector(".app");
    const collapse = document.getElementById("sidebar-collapse");
    const toggle = document.getElementById("sidebar-toggle");
    if (!app || !collapse || !toggle) return;

    if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true" && window.innerWidth > 900) {
      app.classList.add("is-sidebar-collapsed");
    }

    const onCollapse = () => {
      if (window.innerWidth > 900) {
        app.classList.add("is-sidebar-collapsed");
        localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");
      }
    };
    const onExpand = () => {
      if (window.innerWidth > 900) {
        app.classList.remove("is-sidebar-collapsed");
        localStorage.setItem(SIDEBAR_STORAGE_KEY, "false");
      }
    };

    collapse.addEventListener("click", onCollapse);
    toggle.addEventListener("click", onExpand);
    return () => {
      collapse.removeEventListener("click", onCollapse);
      toggle.removeEventListener("click", onExpand);
    };
  }, []);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOrganizer, logout } = useAuth();
  const navItems = getNavItemsForRole(isOrganizer);
  useSidebarCollapse();

  const handleBottomClick = async (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (href !== "/login") return;
    event.preventDefault();
    await logout();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <button
        type="button"
        className="sidebar__collapse"
        id="sidebar-collapse"
        aria-label="Collapse sidebar"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="2.8" fill="currentColor" opacity="0.78" />
          <circle cx="17.5" cy="6.5" r="3.6" fill="currentColor" />
          <circle cx="6.5" cy="17.5" r="3.6" fill="currentColor" />
          <circle cx="17.5" cy="17.5" r="2.3" fill="currentColor" opacity="0.52" />
        </svg>
      </button>
      <button
        type="button"
        className="sidebar__toggle"
        id="sidebar-toggle"
        aria-label="Expand sidebar"
      >
        <Image src="/finallogo.png" alt="" width={32} height={32} />
      </button>
      <div className="sidebar__brand">
        <Image
          src="/finallogo.png"
          alt="DC Space"
          className="sidebar__logo"
          width={120}
          height={60}
        />
        <span className="sidebar__title">DC SPACE</span>
      </div>

      <nav aria-label="Primary">
        <ul className="nav">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <NavIcon icon={item.icon} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar__spacer" aria-hidden="true" />

      <ul className="nav nav--bottom">
        {BOTTOM_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={active ? "is-active" : undefined}
                onClick={(event) => handleBottomClick(event, item.href)}
              >
                <NavIcon icon={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="app">{children}</div>;
}
