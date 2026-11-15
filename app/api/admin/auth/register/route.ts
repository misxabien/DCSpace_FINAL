import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { isSchoolEmail } from "@/lib/user-server/auth-helpers";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { hashPassword } from "@/lib/user-server/password";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { verifyRegistrationCode } from "@/lib/user-server/verification";

/** Self-registered admins wait here until a Super Admin turns on "Make Admin". */
const PENDING_ADMIN_ROLE = "admin-pending";

/**
 * Public self-registration for Admin accounts.
 * - Super Admin accounts are pre-created only (never self-registered).
 * - New admins are created as "admin-pending" and cannot sign in until a
 *   Super Admin approves them (role → "admin").
 */
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
  const requestedRole = String(body.role || "admin").trim().toLowerCase();

  if (!firstName || !lastName || !studentNumber || !email || !password) {
    return NextResponse.json({ error: "Required account fields are missing." }, { status: 400 });
  }
  if (requestedRole === "super-admin") {
    return NextResponse.json(
      { error: "Super Admin accounts cannot be registered. Ask the system owner for access." },
      { status: 403 },
    );
  }
  if (requestedRole !== "admin") {
    return NextResponse.json({ error: "Account role must be Admin." }, { status: 400 });
  }
  const role = PENDING_ADMIN_ROLE;
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

    void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
      logUserActivity({
        type: "user_registered",
        actorEmail: profile.email,
        actorName: profile.fullName,
        actorRole: role,
        organization: profile.organizationPart,
        meta: { studentNumber: profile.studentNumber, source: "admin-self-register" },
      }),
    );

    void import("@/lib/user-server/portal").then(({ notifySuperAdmins }) =>
      notifySuperAdmins({
        title: "Admin access request",
        body: `${profile.fullName || profile.email} registered for the Admin Console. Open their account in Users and turn on Make Admin to approve.`,
        type: "admin-access-request",
      }),
    );

    // No session is issued: the account cannot use the Admin Console until approved.
    return NextResponse.json(
      {
        message:
          "Account created. A Super Admin must approve your admin access before you can sign in.",
        pendingApproval: true,
        user: profile,
      },
      { status: 201 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create administrator account.", details },
      { status: 500 },
    );
  }
}
