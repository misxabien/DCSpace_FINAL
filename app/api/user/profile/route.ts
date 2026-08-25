import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireUserAuth } from "@/lib/user-server/require-user-auth";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

async function requireProfileUser(request: Request) {
  const jwtAuth = await requireUserAuth(request);
  if (!("error" in jwtAuth)) return jwtAuth;

  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return jwtAuth;
  }

  const db = await getUserDb();
  const user = actor.userId && ObjectId.isValid(actor.userId)
    ? await db.collection("users").findOne({ _id: new ObjectId(actor.userId) })
    : await db.collection("users").findOne({ email: actor.email });
  if (!user) {
    return { error: "User not found.", status: 404 } as const;
  }
  return { user: user as Parameters<typeof sanitizeUser>[0] };
}

export async function GET(request: Request) {
  const authResult = await requireProfileUser(request);

  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  return NextResponse.json({ profile: sanitizeUser(authResult.user) }, { status: 200 });
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireProfileUser(request);

    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const updates: Record<string, string> = {};

    const fullName = pickString(body?.fullName);
    let firstName = pickString(body?.firstName);
    let lastName = pickString(body?.lastName);
    if (fullName && !firstName && !lastName) {
      const parts = fullName.split(/\s+/).filter(Boolean);
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ");
    }
    const photoUrl = pickString(body?.photoUrl);
    const bannerUrl = pickString(body?.bannerUrl);
    const course = pickString(body?.course);
    const school = pickString(body?.school);
    const organizationPart = pickString(body?.organizationPart);
    const organizationRole = pickString(body?.organizationRole);
    const rfidNumber = pickString(body?.rfidNumber);

    if (photoUrl !== undefined && photoUrl.length > 500_000) {
      return NextResponse.json(
        { error: "Profile photo is too large. Please use a smaller image." },
        { status: 400 },
      );
    }

    if (bannerUrl !== undefined && bannerUrl.length > 700_000) {
      return NextResponse.json(
        { error: "Background photo is too large. Please use a smaller image." },
        { status: 400 },
      );
    }

    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;
    if (bannerUrl !== undefined) updates.bannerUrl = bannerUrl;
    if (course !== undefined) updates.course = course;
    if (school !== undefined) updates.school = school;
    if (organizationPart !== undefined) updates.organizationPart = organizationPart;
    if (organizationRole !== undefined) updates.organizationRole = organizationRole;
    if (rfidNumber !== undefined) updates.rfidNumber = rfidNumber;

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: "No profile fields to update." }, { status: 400 });
    }

    updates.updatedAt = new Date().toISOString();

    const db = await getUserDb();
    await db.collection("users").updateOne({ _id: new ObjectId(authResult.user._id) }, { $set: updates });
    const savedUser = await db.collection("users").findOne({ _id: new ObjectId(authResult.user._id) });

    if (!savedUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json(
      {
        profile: sanitizeUser(savedUser as Parameters<typeof sanitizeUser>[0]),
        message: "Profile updated.",
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update profile.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
