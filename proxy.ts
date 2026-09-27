import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/types";
import {
  buildPortalAbsoluteUrl,
  getConfiguredPortalHosts,
  isUserPortalPath,
  resolvePortalFromHost,
} from "@/lib/portal-host";

/** Public admin auth pages (no session required). */
const ADMIN_PUBLIC = new Set([
  "/admin",
  "/admin/selection01",
  "/admin/login02",
  "/admin/register03",
  "/admin/school04",
  "/admin/acc05",
  "/admin/verify06",
  "/admin/agreement08",
  "/admin/fp09",
  "/admin/fpv10",
  "/admin/fpp11",
  "/admin/pass07",
]);

function enforceOrganized(request: NextRequest) {
  const user = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user?.isOrganizer) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/home" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function enforceAdmin(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);

  const isPublic =
    ADMIN_PUBLIC.has(pathname) || pathname.startsWith("/admin/login02");

  if (!isPublic && !user?.isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/selection01";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const superOnly =
    pathname === "/admin/administration" ||
    pathname === "/admin/manageadmin" ||
    (pathname === "/admin/add40" &&
      request.nextUrl.searchParams.get("from") === "manageadmin");
  if (superOnly && user?.role !== "super-admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/home12";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

function redirectToAdminEntry(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/admin";
  url.search = "";
  return NextResponse.redirect(url);
}

function redirectCrossHost(
  request: NextRequest,
  targetHost: string,
  pathname: string,
) {
  const protocol = request.nextUrl.protocol || "https:";
  const dest = buildPortalAbsoluteUrl(
    targetHost,
    pathname,
    request.nextUrl.search,
    protocol,
  );
  return NextResponse.redirect(dest);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const portal = resolvePortalFromHost(request.headers.get("host"));
  const { admin: adminHost } = getConfiguredPortalHosts();

  // Shared API always passes through on either host.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (portal === "admin") {
    if (pathname.startsWith("/admin")) {
      return enforceAdmin(request);
    }
    // Admin host root / user paths → admin portal entry.
    if (pathname === "/" || isUserPortalPath(pathname)) {
      return redirectToAdminEntry(request);
    }
    return NextResponse.next();
  }

  if (portal === "user") {
    if (pathname.startsWith("/admin")) {
      if (adminHost) {
        return redirectCrossHost(request, adminHost, pathname);
      }
      // Admin host not configured: keep path-based /admin on this host.
      return enforceAdmin(request);
    }
    if (pathname.startsWith("/organized")) {
      return enforceOrganized(request);
    }
    return NextResponse.next();
  }

  // Dual-path mode (hosts unset or unmatched — e.g. local / preview URL).
  if (pathname.startsWith("/organized")) {
    return enforceOrganized(request);
  }
  if (pathname.startsWith("/admin")) {
    return enforceAdmin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on app routes so hostname portal routing can redirect `/` and
     * cross-portal paths. Skip Next internals and common static assets.
     */
    "/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|css|js|map|txt|woff2?)$).*)",
  ],
};
