import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/user-server/cors";
import { verifyPasswordResetCode } from "@/lib/user-server/verification";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || body.verificationCode || "").trim();
    const result = await verifyPasswordResetCode(email, code);
    if (!result.ok) {
      return withCors(NextResponse.json({ error: result.error }, { status: 400 }));
    }
    return withCors(NextResponse.json({ ok: true, email }));
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return withCors(
      NextResponse.json({ error: "Failed to verify code.", details }, { status: 500 }),
    );
  }
}
