import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/user-server/cors";
import { checkRegistrationCode } from "@/lib/user-server/verification";

export async function OPTIONS() {
  return optionsResponse();
}

/** Peek-check a code without consuming it (final consume happens on register). */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim();
    const verificationCode = String(body.verificationCode || body.code || "").trim();
    const result = await checkRegistrationCode(email, verificationCode);
    if (!result.ok) {
      return withCors(NextResponse.json({ error: result.error }, { status: 400 }));
    }
    return withCors(NextResponse.json({ ok: true, message: "Code accepted." }));
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return withCors(
      NextResponse.json({ error: "Could not check verification code.", details }, { status: 500 }),
    );
  }
}
