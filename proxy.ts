import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/types";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/organized")) {
    return NextResponse.next();
  }

  const user = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user?.isOrganizer) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/home" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/organized/:path*"],
};
