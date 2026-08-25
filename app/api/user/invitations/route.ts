import { NextResponse } from "next/server";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { invitationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const db = await getUserDb();
    const docs = await invitationsCollection(db)
      .find({ email: actor.email })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return NextResponse.json({
      invitations: docs.map((doc) => ({
        id: String(doc._id),
        eventId: String(doc.eventId || ""),
        eventTitle: String(doc.eventTitle || ""),
        email: String(doc.email || ""),
        userName: String(doc.userName || ""),
        status: String(doc.status || "pending"),
        createdAt: String(doc.createdAt || ""),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load invitations.", details },
      { status: 500 },
    );
  }
}
