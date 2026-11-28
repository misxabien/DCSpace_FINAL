import { NextResponse } from "next/server";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { usersCollection } from "@/lib/db/user-collections";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { checkOrganizerAccess } from "@/lib/user-server/organizer-access";

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  // Directory of students/faculty is for organizers inviting participants only.
  const access = await checkOrganizerAccess(actor.email, "inviteSomeone");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const db = await getUserDb();
    const { searchParams } = new URL(request.url);
    const role = String(searchParams.get("role") || "").toLowerCase();
    const filter: Record<string, unknown> = {};
    if (role === "faculty") {
      filter.role = { $in: ["faculty", "organizer"] };
    } else if (role === "student") {
      filter.role = { $nin: ["faculty", "organizer", "admin", "super-admin"] };
    }

    const docs = await usersCollection(db)
      // Only what the invite list shows (photos are stored inline and are large).
      .find(filter, {
        projection: { email: 1, firstName: 1, lastName: 1, studentNumber: 1, course: 1, organizationPart: 1, role: 1 },
      })
      .sort({ lastName: 1, firstName: 1 })
      // The whole directory: the invite table searches and paginates it in the
      // browser, so a 200 cap hid everyone after the first 200 names.
      .limit(5000)
      .toArray();

    return NextResponse.json({
      users: docs.map((user) => ({
        id: String(user._id),
        email: String(user.email || ""),
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || String(user.email || ""),
        studentNumber: String(user.studentNumber || ""),
        course: String(user.course || ""),
        organization: String(user.organizationPart || ""),
        role: String(user.role || "student"),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load users.", details },
      { status: 500 },
    );
  }
}
