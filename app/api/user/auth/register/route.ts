import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { encodeSession, sessionCookieOptions } from "@/lib/auth/session";
import { toSessionUser } from "@/lib/auth/toSessionUser";
import { validateRegistrationBody } from "@/lib/user-server/auth-helpers";
import { withCors, optionsResponse } from "@/lib/user-server/cors";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { hashPassword } from "@/lib/user-server/password";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { signAuthToken } from "@/lib/user-server/token";
import {
  checkRegistrationCode,
  consumeRegistrationCode,
} from "@/lib/user-server/verification";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationError = validateRegistrationBody(body);
    if (validationError) {
      return withCors(NextResponse.json({ error: validationError }, { status: 400 }));
    }

    const email = String(body.email).trim().toLowerCase();
    const verificationCode = String(body.verificationCode);

    // Peek first so a failed insert does not burn a valid email code.
    const verification = await checkRegistrationCode(email, verificationCode);
    if (!verification.ok) {
      return withCors(NextResponse.json({ error: verification.error }, { status: 400 }));
    }

    const rfidNumber = String(body.rfidNumber || "").trim();
    const photoUrl = String(body.photoUrl || "").trim();
    const newUser = {
      firstName: String(body.firstName).trim(),
      lastName: String(body.lastName).trim(),
      studentNumber: String(body.studentNumber).trim(),
      email,
      ...(photoUrl ? { photoUrl } : {}),
      ...(rfidNumber ? { rfidNumber } : {}),
      organizationPart: String(body.organizationPart || "").trim(),
      organizationRole: String(body.organizationRole || "").trim(),
      course: String(body.course || "").trim(),
      school: String(body.school || "").trim(),
      passwordHash: hashPassword(String(body.password)),
      role: body.role === "faculty" ? "faculty" : "student",
      dataPrivacyAcceptedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const db = await getUserDb();
    const users = db.collection("users");
    const existingFilters: Array<Record<string, string>> = [
      { email: newUser.email },
      { studentNumber: newUser.studentNumber },
    ];
    if (newUser.rfidNumber) {
      existingFilters.push({ rfidNumber: newUser.rfidNumber });
    }

    const existingUser = await users.findOne({ $or: existingFilters });
    if (existingUser) {
      if (newUser.rfidNumber && existingUser.rfidNumber === newUser.rfidNumber) {
        return withCors(
          NextResponse.json(
            { error: "This RFID tag is already linked to another account." },
            { status: 409 },
          ),
        );
      }
      return withCors(
        NextResponse.json(
          { error: "Account already exists with this email or student number." },
          { status: 409 },
        ),
      );
    }

    const insertResult = await users.insertOne(newUser);
    await consumeRegistrationCode(email, verificationCode);

    const savedUser = { ...newUser, _id: insertResult.insertedId as ObjectId };
    const profile = sanitizeUser(savedUser);
    const token = signAuthToken({
      sub: savedUser._id.toString(),
      email: savedUser.email,
      role: savedUser.role,
    });

    const sessionUser = toSessionUser({
      email: profile.email,
      name: profile.fullName || profile.email,
      role: profile.role,
      organizationRole: profile.organizationRole,
    });

    void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
      logUserActivity({
        type: "user_registered",
        actorEmail: profile.email,
        actorName: profile.fullName,
        actorRole: profile.role,
        organization: profile.organizationPart,
        meta: { studentNumber: profile.studentNumber },
      }),
    );

    const response = withCors(
      NextResponse.json(
        {
          message: "Account created successfully.",
          token,
          user: profile,
        },
        { status: 201 },
      ),
    );
    response.cookies.set({
      ...sessionCookieOptions(),
      value: encodeSession(sessionUser),
    });
    return response;
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return withCors(
      NextResponse.json(
        {
          error: "Failed to register account.",
          details,
          message: details,
        },
        { status: 500 },
      ),
    );
  }
}
