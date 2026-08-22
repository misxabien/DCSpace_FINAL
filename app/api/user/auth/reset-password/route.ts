import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/user-server/cors";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { hashPassword } from "@/lib/user-server/password";
import { consumePasswordResetCode } from "@/lib/user-server/verification";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || body.verificationCode || "").trim();
    const newPassword = String(body.newPassword || body.password || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (newPassword.length < 8) {
      return withCors(
        NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 }),
      );
    }
    if (newPassword !== confirmPassword) {
      return withCors(
        NextResponse.json({ error: "Passwords do not match." }, { status: 400 }),
      );
    }

    const verified = await consumePasswordResetCode(email, code);
    if (!verified.ok) {
      return withCors(NextResponse.json({ error: verified.error }, { status: 400 }));
    }

    const db = await getUserDb();
    const result = await db.collection("users").updateOne(
      { email },
      { $set: { passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() } },
    );
    if (!result.matchedCount) {
      return withCors(NextResponse.json({ error: "Account not found." }, { status: 404 }));
    }

    return withCors(NextResponse.json({ message: "Password updated. You can sign in now." }));
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return withCors(
      NextResponse.json({ error: "Failed to reset password.", details }, { status: 500 }),
    );
  }
}
