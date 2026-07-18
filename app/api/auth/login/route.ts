import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth/mockUsers";
import { encodeSession, sessionCookieOptions } from "@/lib/auth/session";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "School email and password are required." },
      { status: 400 }
    );
  }

  const user = authenticate(email, password);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid credentials. Use an @sdca.edu.ph school email." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ user });
  response.cookies.set({
    ...sessionCookieOptions(),
    value: encodeSession(user),
  });
  return response;
}
