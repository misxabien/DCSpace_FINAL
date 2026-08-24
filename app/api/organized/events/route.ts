import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection, sanitizeEvent, type SpaceEvent } from "@/lib/events/types";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { organizerOwnershipFilter } from "@/lib/events/ownership";
import { registrationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const userDb = await getUserDb();
    const adminDb = await getAdminDb();
    const docs = await eventsCollection(adminDb)
      .find(organizerOwnershipFilter(actor.email, actor.userId))
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();

    const eventIds = docs.map((doc) => String(doc._id));
    const counts = eventIds.length
      ? await registrationsCollection(userDb)
          .aggregate([
            { $match: { eventId: { $in: eventIds } } },
            { $group: { _id: "$eventId", count: { $sum: 1 } } },
          ])
          .toArray()
      : [];
    const countMap = new Map(counts.map((row) => [String(row._id), Number(row.count || 0)]));

    return NextResponse.json({
      events: docs.map((doc) => {
        const event = sanitizeEvent(doc as SpaceEvent & { _id: ObjectId }, {
          includePoster: true,
        });
        return {
          ...event,
          submissions: countMap.get(event.id) || 0,
        };
      }),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load organized events.", details },
      { status: 500 },
    );
  }
}
