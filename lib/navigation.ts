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

export const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/events", label: "Events", icon: "events" },
  { href: "/attendance", label: "Attendance", icon: "attendance" },
  { href: "/saved", label: "Saved Events", icon: "saved" },
  { href: "/certificates", label: "Certificates", icon: "certificates" },
] as const;

export const BOTTOM_NAV = [
  { href: "/feedback", label: "Submit Feedback", icon: "feedback" },
  { href: "/login", label: "Log out", icon: "logout" },
] as const;

export function isNavActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  if (href === "/events") {
    return pathname === "/events" || pathname.startsWith("/events/");
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
