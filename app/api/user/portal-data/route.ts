import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection, sanitizeEvent, type SpaceEvent } from "@/lib/events/types";
import { compareEventsForDisplay } from "@/lib/events/map-event";
import { PORTAL_EVENT_PROJECTION } from "@/lib/events/list-projection";
import { findEventsByIds } from "@/lib/events/find-event";
import { escapeRegex } from "@/lib/events/ownership";
import { PUBLIC_EVENT_STATUSES } from "@/lib/events/public-status";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { savedEventsCollection } from "@/lib/db/user-collections";
import { attendanceCollection } from "@/lib/user-server/activity";
import { invitationsCollection, registrationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

/** One round-trip for student home/events/attendance: browse data + this account's context. */
export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const email = actor.email.trim().toLowerCase();
  const emailFilter = { $regex: `^${escapeRegex(email)}$`, $options: "i" };

  try {
    const [userDb, adminDb] = await Promise.all([getUserDb(), getAdminDb()]);

    const [eventDocs, registrationDocs, invitationDocs, savedDoc, attendanceDocs] =
      await Promise.all([
        eventsCollection(adminDb)
          .find({ status: { $in: [...PUBLIC_EVENT_STATUSES] } })
          .project(PORTAL_EVENT_PROJECTION)
          .sort({ startsAt: 1, updatedAt: -1 })
          .limit(500)
          .toArray(),
        registrationsCollection(userDb)
          .find({ email: emailFilter })
          .project({ eventId: 1, status: 1, eventTitle: 1, createdAt: 1 })
          .sort({ createdAt: -1 })
          .limit(500)
          .toArray(),
        invitationsCollection(userDb)
          .find({ email: emailFilter })
          .project({ eventId: 1, eventTitle: 1, status: 1, createdAt: 1 })
          .sort({ createdAt: -1 })
          .limit(500)
          .toArray(),
        savedEventsCollection(userDb).findOne(
          { email: emailFilter },
          { projection: { eventIds: 1 } },
        ),
        attendanceCollection(userDb)
          .find({ email: emailFilter })
          .sort({ scannedAt: -1, createdAt: -1 })
          .limit(200)
          .toArray(),
      ]);

    const byId = new Map(
      eventDocs.map((doc) => [String(doc._id), doc as SpaceEvent & { _id: ObjectId }]),
    );

    // Pull any registered / attended events missing from the public browse set.
    const neededIds = [
      ...registrationDocs.map((doc) => String(doc.eventId || "")),
      ...attendanceDocs.map((doc) => String(doc.eventId || "")),
      ...invitationDocs.map((doc) => String(doc.eventId || "")),
    ].filter((id) => id && !byId.has(id));

    if (neededIds.length) {
      const extras = await findEventsByIds(neededIds);
      for (const doc of extras) {
        byId.set(String(doc._id), doc);
      }
    }

    const publicEventIds = new Set(
      [...byId.values()]
        .filter((doc) => PUBLIC_EVENT_STATUSES.includes(doc.status as (typeof PUBLIC_EVENT_STATUSES)[number])
          || registrationDocs.some((r) => String(r.eventId) === String(doc._id))
          || attendanceDocs.some((a) => String(a.eventId) === String(doc._id)))
        .map((doc) => String(doc._id)),
    );

    const invitations = invitationDocs
      .filter((doc) => publicEventIds.has(String(doc.eventId || "")) || byId.has(String(doc.eventId || "")))
      .map((doc) => ({
        id: String(doc._id),
        eventId: String(doc.eventId || ""),
        eventTitle: String(doc.eventTitle || ""),
        status: String(doc.status || "pending"),
        createdAt: String(doc.createdAt || ""),
      }));

    const events = [...byId.values()]
      .map((doc) =>
        sanitizeEvent(doc as SpaceEvent & { _id: ObjectId }, { includePoster: false }),
      )
      .sort(compareEventsForDisplay);

    const attendance = attendanceDocs.map((doc) => ({
      id: String(doc._id),
      eventId: String(doc.eventId || ""),
      eventTitle: String(doc.eventTitle || doc.eventName || ""),
      action: String(doc.action || "in"),
      scannedAt: String(doc.scannedAt || doc.createdAt || ""),
      createdAt: String(doc.createdAt || doc.scannedAt || ""),
      attendanceMinutes: Number(doc.attendanceMinutes || 0),
      qualifiedForCertificate: Boolean(doc.qualifiedForCertificate),
      source: String(doc.source || "session"),
    }));

    return NextResponse.json({
      events,
      registrations: registrationDocs.map((doc) => ({
        eventId: String(doc.eventId || ""),
        status: String(doc.status || "joined"),
        eventTitle: String(doc.eventTitle || ""),
        createdAt: String(doc.createdAt || ""),
      })),
      invitations,
      savedEventIds: Array.isArray(savedDoc?.eventIds)
        ? savedDoc.eventIds.map(String)
        : [],
      attendance,
      accountEmail: email,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load portal data.", details },
      { status: 500 },
    );
  }
}
