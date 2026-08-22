import { NextResponse } from "next/server";
import { isSchoolEmail } from "@/lib/user-server/auth-helpers";
import { withCors, optionsResponse } from "@/lib/user-server/cors";
import { issuePasswordResetCode } from "@/lib/user-server/verification";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !isSchoolEmail(email)) {
      return withCors(
        NextResponse.json({ error: "Use your school email ending in @sdca.edu.ph." }, { status: 400 }),
      );
    }

    const result = await issuePasswordResetCode(email);
    return withCors(
      NextResponse.json({
        message: result.devMode
          ? "Reset code ready. Check the terminal where the server is running."
          : "If this email is registered, a verification code was sent.",
        email: result.email,
        expiresAt: result.expiresAt,
      }),
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return withCors(
      NextResponse.json({ error: "Failed to send reset code.", details }, { status: 500 }),
    );
  }
}
