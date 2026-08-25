import { NextResponse } from "next/server";
import { activitiesCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";

/** Recent actions for the signed-in account (registrations, taps, feedback, certificates). */
export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const db = await getUserDb();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 30) || 30, 100);

    const docs = await activitiesCollection(db)
      .find({ actorEmail: actor.email.trim().toLowerCase() })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      activities: docs.map((doc) => ({
        id: String(doc._id),
        type: String(doc.type || ""),
        actorName: String(doc.actorName || ""),
        targetId: String(doc.targetId || ""),
        targetTitle: String(doc.targetTitle || ""),
        organization: String(doc.organization || ""),
        meta: doc.meta || {},
        createdAt: String(doc.createdAt || ""),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load activity.", details },
      { status: 500 },
    );
  }
}
