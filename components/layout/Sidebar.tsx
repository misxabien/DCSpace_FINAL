import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV, isNavActive, NAV_ITEMS } from "@/lib/navigation";
import { NavIcon } from "@/components/layout/NavIcons";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={`${styles.sidebar} sidebar`} aria-label="Main navigation">
      <button
        type="button"
        className={`${styles.collapse} sidebar__collapse`}
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
        className={`${styles.toggle} sidebar__toggle`}
        id="sidebar-toggle"
        aria-label="Expand sidebar"
      >
        <Image src="/finallogo.png" alt="" width={32} height={32} />
      </button>
      <div className={`${styles.brand} sidebar__brand`}>
        <Image src="/finallogo.png" alt="DC Space" className={styles.logo} width={120} height={60} />
        <span className={styles.title}>DC SPACE</span>
      </div>

      <nav aria-label="Primary">
        <ul className={`${styles.nav} nav`}>
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={active ? `${styles.active} is-active` : undefined}
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

      <div className={`${styles.spacer} sidebar__spacer`} aria-hidden="true" />

      <ul className={`${styles.nav} ${styles.navBottom} nav nav--bottom`}>
        {BOTTOM_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} className={active ? `${styles.active} is-active` : undefined}>
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
  return <div className={`${styles.app} app`}>{children}</div>;
}
