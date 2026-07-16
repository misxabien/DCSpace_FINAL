import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireUserAuth } from "@/lib/user-server/require-user-auth";
import { hashPassword, verifyPassword } from "@/lib/user-server/password";
import { withCors, optionsResponse } from "@/lib/user-server/cors";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const authResult = await requireUserAuth(request);
    if ("error" in authResult) {
      return withCors(NextResponse.json({ error: authResult.error }, { status: authResult.status }));
    }

    const body = await request.json();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return withCors(
        NextResponse.json(
          { error: "currentPassword, newPassword, and confirmPassword are required." },
          { status: 400 },
        ),
      );
    }

    if (newPassword.length < 8) {
      return withCors(
        NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 }),
      );
    }

    if (newPassword !== confirmPassword) {
      return withCors(
        NextResponse.json({ error: "New password and confirmation do not match." }, { status: 400 }),
      );
    }

    if (currentPassword === newPassword) {
      return withCors(
        NextResponse.json(
          { error: "New password must be different from your current password." },
          { status: 400 },
        ),
      );
    }

    const db = await getUserDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(authResult.user._id) });
    if (!user) {
      return withCors(NextResponse.json({ error: "User not found." }, { status: 404 }));
    }

    if (!verifyPassword(currentPassword, String(user.passwordHash || ""))) {
      return withCors(
        NextResponse.json({ error: "Current password is incorrect." }, { status: 401 }),
      );
    }

    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: hashPassword(newPassword),
          updatedAt: new Date().toISOString(),
        },
      },
    );

    return withCors(
      NextResponse.json({ message: "Password updated successfully." }, { status: 200 }),
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          error: "Failed to change password.",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      ),
    );
  }
}
