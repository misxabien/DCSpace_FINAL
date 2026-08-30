import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/types";

/** Public admin auth pages (no session required). */
const ADMIN_PUBLIC = new Set([
  "/admin",
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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/organized")) {
    if (!user?.isOrganizer) {
      const url = request.nextUrl.clone();
      url.pathname = user ? "/home" : "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const isPublic =
      ADMIN_PUBLIC.has(pathname) || pathname.startsWith("/admin/login02");

    if (!isPublic && !user?.isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login02";
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/organized/:path*", "/admin", "/admin/:path*"],
};
