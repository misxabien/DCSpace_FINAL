import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { getAdminDb } from "@/lib/db/get-db";
import { escapeRegex } from "@/lib/events/ownership";
import { isPublicEventStatus } from "@/lib/events/public-status";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { invitationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const userDb = await getUserDb();
    const email = actor.email.trim().toLowerCase();
    const docs = await invitationsCollection(userDb)
      .find({
        email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    const eventIds = [
      ...new Set(
        docs
          .map((doc) => String(doc.eventId || "").trim())
          .filter((id) => id && ObjectId.isValid(id)),
      ),
    ];

    const adminDb = await getAdminDb();
    const events =
      eventIds.length > 0
        ? await eventsCollection(adminDb)
            .find({
              _id: { $in: eventIds.map((id) => new ObjectId(id)) },
            })
            .toArray()
        : [];

    const publicEventIds = new Set(
      events
        .filter((event) => isPublicEventStatus(event.status))
        .map((event) => String(event._id)),
    );

    return NextResponse.json({
      invitations: docs
        .filter((doc) => publicEventIds.has(String(doc.eventId || "")))
        .map((doc) => ({
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
