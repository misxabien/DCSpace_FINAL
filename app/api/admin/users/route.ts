import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";

/** List school users (students/faculty/admins) for the admin console. */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const school = (searchParams.get("school") || "").trim();
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(Number(searchParams.get("limit") || 100) || 100, 200);

    const filter: Record<string, unknown> = {};
    if (role) {
      const roles = role
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      if (roles.length === 1 && (roles[0] === "admins" || roles[0] === "administrator")) {
        filter.role = { $in: ["admin", "super-admin"] };
      } else if (roles.length === 1 && roles[0] === "admin") {
        // Admin directory includes Super Admin accounts
        filter.role = { $in: ["admin", "super-admin"] };
      } else if (roles.length > 1) {
        filter.role = { $in: roles };
      } else {
        filter.role = roles[0];
      }
    }

    const schoolKey = school.toLowerCase();
    const schoolAliases: Record<string, string[]> = {
      sase: ["sase", "accountancy", "science and education"],
      scemc: [
        "scemc",
        "scmcs",
        "computing",
        "engineering",
        "multimedia",
        "communication",
        "computer",
      ],
      // legacy query key alias
      scmcs: [
        "scemc",
        "scmcs",
        "computing",
        "engineering",
        "multimedia",
        "communication",
        "computer",
      ],
      snahs: ["snahs", "nursing", "allied health"],
      smls: ["smls", "medical laboratory", "laboratory science"],
      sihtm: ["sihtm", "hospitality", "tourism"],
    };
    if (school) {
      const aliases = schoolAliases[schoolKey] || [school];
      filter.school = {
        $regex: aliases.map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        $options: "i",
      };
    }
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { studentNumber: { $regex: q, $options: "i" } },
      ];
    }

    const db = await getUserDb();
    const collection = db.collection("users");
    const total = await collection.countDocuments(filter);
    const docs = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const users = docs.map((doc) =>
      sanitizeUser(
        doc as {
          _id: ObjectId;
          firstName: string;
          lastName: string;
          studentNumber: string;
          email: string;
          photoUrl?: string;
          bannerUrl?: string;
          role?: string;
          rfidNumber?: string;
          organizationPart?: string;
          organizationRole?: string;
          course?: string;
          school?: string;
        },
      ),
    );

    return NextResponse.json({ users, total });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load users.", details },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const studentNumber = String(body.studentNumber || body.idNumber || "").trim();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || body.password2 || password);
  const role = String(body.role || "faculty").toLowerCase();

  if (!firstName || !lastName || !email || !studentNumber || !password) {
    return NextResponse.json({ error: "Required account fields are missing." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }
  if (role === "admin" || role === "super-admin") {
    if (auth.session.role !== "super-admin") {
      return NextResponse.json({ error: "Only a Super Admin can create admin accounts." }, { status: 403 });
    }
  }

  try {
    const { hashPassword } = await import("@/lib/user-server/password");
    const db = await getUserDb();
    const existing = await db.collection("users").findOne({
      $or: [{ email }, { studentNumber }],
    });
    if (existing) {
      return NextResponse.json({ error: "A user with this email or ID already exists." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const doc = {
      firstName,
      lastName,
      email,
      studentNumber,
      course: String(body.course || "").trim(),
      school: String(body.school || "").trim(),
      organizationPart: String(body.organizationPart || body.organization || "").trim(),
      organizationRole: String(body.organizationRole || body.orgRole || "").trim(),
      rfidNumber: String(body.rfidNumber || body.rfid || "").trim(),
      role: ["student", "faculty", "admin", "super-admin"].includes(role) ? role : "faculty",
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
      createdByEmail: auth.session.email,
    };
    const result = await db.collection("users").insertOne(doc);
    return NextResponse.json(
      {
        user: sanitizeUser({ ...doc, _id: result.insertedId } as Parameters<typeof sanitizeUser>[0]),
        message: "User created.",
      },
      { status: 201 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to create user.", details }, { status: 500 });
  }
}
