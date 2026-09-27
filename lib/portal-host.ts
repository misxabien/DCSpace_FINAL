/**
 * Dual-portal hosts for one Vercel project.
 *
 * Set both env vars in Vercel (and locally) so each hostname maps to a portal:
 *   NEXT_PUBLIC_USER_HOST=dcspace.vercel.app
 *   NEXT_PUBLIC_ADMIN_HOST=admin.dcspace.edu
 *
 * When unset, path-based access stays available on any host
 * (`/` = user, `/admin` = admin).
 */

export type PortalKind = "user" | "admin";

function stripPort(host: string): string {
  // Keep IPv6 bracket form intact; strip :port only for hostname:port
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end >= 0 ? host.slice(0, end + 1) : host;
  }
  const idx = host.lastIndexOf(":");
  if (idx > 0 && /^\d+$/.test(host.slice(idx + 1))) {
    return host.slice(0, idx);
  }
  return host;
}

/** Normalize Host header or env value to a comparable hostname (no port, lowercased). */
export function normalizeHost(value: string | null | undefined): string {
  if (!value) return "";
  let host = value.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.split("/")[0] ?? "";
  return stripPort(host);
}

export function getConfiguredPortalHosts(): {
  user: string;
  admin: string;
} {
  return {
    user: normalizeHost(process.env.NEXT_PUBLIC_USER_HOST),
    admin: normalizeHost(process.env.NEXT_PUBLIC_ADMIN_HOST),
  };
}

/** Which portal this request host belongs to, or null = dual-path (both portals on one host). */
export function resolvePortalFromHost(
  hostHeader: string | null | undefined,
): PortalKind | null {
  const host = normalizeHost(hostHeader);
  if (!host) return null;

  const { user, admin } = getConfiguredPortalHosts();
  if (admin && host === admin) return "admin";
  if (user && host === user) return "user";
  return null;
}

export function buildPortalAbsoluteUrl(
  targetHost: string,
  pathname: string,
  search = "",
  protocol: string,
): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const qs = search && !search.startsWith("?") ? `?${search}` : search;
  return `${protocol}//${targetHost}${path}${qs}`;
}

/** Paths that belong to the student/faculty portal (not admin, not shared API/assets). */
export function isUserPortalPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/admin")) return false;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/_next")) return false;
  return true;
}
