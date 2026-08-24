import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection, sanitizeEvent, type SpaceEvent } from "@/lib/events/types";
import { compareEventsForDisplay } from "@/lib/events/map-event";
import { PORTAL_EVENT_PROJECTION } from "@/lib/events/list-projection";
import { escapeRegex } from "@/lib/events/ownership";
import { PUBLIC_EVENT_STATUSES } from "@/lib/events/public-status";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { savedEventsCollection } from "@/lib/db/user-collections";
import { invitationsCollection, registrationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

/** One round-trip for student home/events pages: browse data + user context. */
export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const email = actor.email.trim().toLowerCase();

  try {
    const [userDb, adminDb] = await Promise.all([getUserDb(), getAdminDb()]);

    const [eventDocs, registrationDocs, invitationDocs, savedDoc] = await Promise.all([
      eventsCollection(adminDb)
        .find({ status: { $in: [...PUBLIC_EVENT_STATUSES] } })
        .project(PORTAL_EVENT_PROJECTION)
        .sort({ startsAt: 1, updatedAt: -1 })
        .limit(500)
        .toArray(),
      registrationsCollection(userDb)
        .find({
          email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
        })
        .project({ eventId: 1, status: 1 })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray(),
      invitationsCollection(userDb)
        .find({
          email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
        })
        .project({ eventId: 1, eventTitle: 1, status: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray(),
      savedEventsCollection(userDb).findOne(
        { email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } },
        { projection: { eventIds: 1 } },
      ),
    ]);

    const publicEventIds = new Set(eventDocs.map((doc) => String(doc._id)));

    const invitations = invitationDocs
      .filter((doc) => publicEventIds.has(String(doc.eventId || "")))
      .map((doc) => ({
        id: String(doc._id),
        eventId: String(doc.eventId || ""),
        eventTitle: String(doc.eventTitle || ""),
        status: String(doc.status || "pending"),
        createdAt: String(doc.createdAt || ""),
      }));

    const events = eventDocs
      .map((doc) =>
        // Use attachment URLs instead of embedding poster base64 (keeps portal fast).
        sanitizeEvent(doc as SpaceEvent & { _id: ObjectId }, { includePoster: false }),
      )
      .sort(compareEventsForDisplay);

    return NextResponse.json({
      events,
      registrations: registrationDocs.map((doc) => ({
        eventId: String(doc.eventId || ""),
        status: String(doc.status || "joined"),
      })),
      invitations,
      savedEventIds: Array.isArray(savedDoc?.eventIds)
        ? savedDoc.eventIds.map(String)
        : [],
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load portal data.", details },
      { status: 500 },
    );
  }
}
