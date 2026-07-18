export type LegacyScript = {
  type: "src" | "inline";
  value: string;
};

export type LegacyPageData = {
  id: string;
  route: string;
  title: string;
  isApp: boolean;
  styles: string;
  html: string;
  scripts: LegacyScript[];
};

export type NavIconName =
  | "home"
  | "events"
  | "organized"
  | "attendance"
  | "saved"
  | "certificates"
  | "feedback"
  | "logout";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

export const STUDENT_NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/events", label: "Events", icon: "events" },
  { href: "/attendance", label: "Attendance", icon: "attendance" },
  { href: "/saved", label: "Saved Events", icon: "saved" },
  { href: "/certificates", label: "Certificates", icon: "certificates" },
];

export const ORGANIZER_NAV_ITEM: NavItem = {
  href: "/organized",
  label: "Events Organized",
  icon: "organized",
};

/** @deprecated Prefer getNavItemsForRole — kept for compatibility */
export const NAV_ITEMS = STUDENT_NAV_ITEMS;

export const BOTTOM_NAV: NavItem[] = [
  { href: "/feedback", label: "Submit Feedback", icon: "feedback" },
  { href: "/login", label: "Log out", icon: "logout" },
];

export function getNavItemsForRole(isOrganizer: boolean): NavItem[] {
  if (!isOrganizer) return STUDENT_NAV_ITEMS;
  const items = [...STUDENT_NAV_ITEMS];
  // Insert Events Organized after Events
  const eventsIndex = items.findIndex((item) => item.href === "/events");
  items.splice(eventsIndex + 1, 0, ORGANIZER_NAV_ITEM);
  return items;
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  if (href === "/events") {
    return pathname === "/events" || pathname.startsWith("/events/");
  }
  if (href === "/organized") {
    return pathname === "/organized" || pathname.startsWith("/organized/");
  }
  if (href === "/attendance") {
    return pathname === "/attendance" || pathname.startsWith("/attendance/");
  }
  if (href === "/saved") {
    return pathname === "/saved" || pathname.startsWith("/saved/");
  }
  if (href === "/certificates") {
    return pathname === "/certificates" || pathname.startsWith("/certificates/");
  }
  if (href === "/feedback") {
    return pathname === "/feedback" || pathname.startsWith("/feedback/");
  }
  return pathname === href;
}
