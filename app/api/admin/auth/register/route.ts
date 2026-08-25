import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { encodeSession, sessionCookieOptions } from "@/lib/auth/session";
import { toSessionUser } from "@/lib/auth/toSessionUser";
import { isSchoolEmail } from "@/lib/user-server/auth-helpers";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { hashPassword } from "@/lib/user-server/password";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { signAuthToken } from "@/lib/user-server/token";
import { verifyRegistrationCode } from "@/lib/user-server/verification";

type AdminRegisterRole = "admin" | "super-admin";

function normalizeRole(value: unknown): AdminRegisterRole | null {
  const role = String(value || "")
    .trim()
    .toLowerCase();
  if (role === "admin" || role === "super-admin") return role;
  return null;
}

/** Public self-registration for Admin / Super Admin accounts. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const middleName = String(body.middleName || "").trim();
  const studentNumber = String(body.studentNumber || body.idNumber || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || body.password2 || "");
  const verificationCode = String(body.verificationCode || "")
    .trim()
    .replace(/\s/g, "");
  const rfidNumber = String(body.rfidNumber || body.rfid || "").trim();
  const course = String(body.course || body.program || "").trim();
  const school = String(body.school || body.department || "").trim();
  const role = normalizeRole(body.role);

  if (!firstName || !lastName || !studentNumber || !email || !password) {
    return NextResponse.json({ error: "Required account fields are missing." }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json(
      { error: "Account role must be Admin or Super Admin." },
      { status: 400 },
    );
  }
  if (!isSchoolEmail(email)) {
    return NextResponse.json(
      { error: "Use your school email ending in @sdca.edu.ph." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }
  if (!/^\d{6}$/.test(verificationCode)) {
    return NextResponse.json({ error: "Enter the 6-digit verification code." }, { status: 400 });
  }
  if (body.dataPrivacyAccepted !== true) {
    return NextResponse.json(
      { error: "You must accept the Data Privacy Policy." },
      { status: 400 },
    );
  }

  const verification = await verifyRegistrationCode(email, verificationCode);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const users = db.collection("users");
    const existingFilters: Array<Record<string, string>> = [
      { email },
      { studentNumber },
    ];
    if (rfidNumber) existingFilters.push({ rfidNumber });

    const existing = await users.findOne({ $or: existingFilters });
    if (existing) {
      if (rfidNumber && existing.rfidNumber === rfidNumber) {
        return NextResponse.json(
          { error: "This RFID tag is already linked to another account." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "An account with this email or employee number already exists." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const doc = {
      firstName,
      lastName,
      ...(middleName ? { middleName } : {}),
      studentNumber,
      email,
      ...(rfidNumber ? { rfidNumber } : {}),
      course,
      school,
      organizationPart: "",
      organizationRole: "",
      passwordHash: hashPassword(password),
      role,
      dataPrivacyAcceptedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await users.insertOne(doc);
    const savedUser = { ...doc, _id: insertResult.insertedId as ObjectId };
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
        meta: { studentNumber: profile.studentNumber, source: "admin-self-register" },
      }),
    );

    const response = NextResponse.json(
      {
        message: "Account created successfully.",
        token,
        user: profile,
      },
      { status: 201 },
    );
    response.cookies.set({
      ...sessionCookieOptions(),
      value: encodeSession(sessionUser),
    });
    return response;
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create administrator account.", details },
      { status: 500 },
    );
  }
}
