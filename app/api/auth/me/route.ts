import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/types";

export async function GET() {
  const jar = await cookies();
  const user = decodeSession(jar.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ user });
}
