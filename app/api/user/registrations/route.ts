import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { findEventById } from "@/lib/events/find-event";
import { isPublicEventStatus } from "@/lib/events/public-status";
import { getUserDb } from "@/lib/db/get-db";
import { logUserActivity } from "@/lib/user-server/activity";
import {
  invitationsCollection,
  notifyAdmins,
  notifyUser,
  registrationsCollection,
} from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

async function bumpEventRegistrationCount(eventId: string, delta: number) {
  if (!ObjectId.isValid(eventId) || !delta) return;
  const { adminDb, userDb } = await findEventById(eventId);
  const oid = new ObjectId(eventId);
  await Promise.all([
    eventsCollection(userDb).updateOne(
      { _id: oid },
      { $inc: { registrationCount: delta }, $set: { updatedAt: new Date().toISOString() } },
    ),
    eventsCollection(adminDb).updateOne(
      { _id: oid },
      { $inc: { registrationCount: delta }, $set: { updatedAt: new Date().toISOString() } },
    ),
  ]);
}

export async function GET(request: Request) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const db = await getUserDb();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const email = searchParams.get("email");
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = eventId;
    if (isAdmin) {
      if (email) filter.email = email.trim().toLowerCase();
    } else if (actor && !("error" in actor)) {
      filter.email = actor.email;
    }
    const docs = await registrationsCollection(db)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return NextResponse.json({
      registrations: docs.map((doc) => ({
        id: String(doc._id),
        eventId: String(doc.eventId || ""),
        eventTitle: String(doc.eventTitle || ""),
        email: String(doc.email || ""),
        userName: String(doc.userName || ""),
        studentNumber: String(doc.studentNumber || ""),
        course: String(doc.course || ""),
        school: String(doc.school || ""),
        organization: String(doc.organization || ""),
        organizationRole: String(doc.organizationRole || ""),
        status: String(doc.status || "joined"),
        createdAt: String(doc.createdAt || ""),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load registrations.", details },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body: { eventId?: string; eventTitle?: string; status?: string; files?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }

  try {
    const userDb = await getUserDb();
    const found = await findEventById(eventId);
    const event = found.event;

    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const eventStatus = String(event.status || "");
    const isOrganizer =
      String(event.organizerEmail || "").trim().toLowerCase() === actor.email ||
      String(event.organizerId || "") === String(actor.userId || "");
    if (!isPublicEventStatus(eventStatus) && !isOrganizer) {
      return NextResponse.json(
        { error: "This event is not open for registration yet." },
        { status: 403 },
      );
    }

    const eventTitle =
      String(body.eventTitle || "").trim() || String(event.title || "Event");

    const existing = await registrationsCollection(userDb).findOne({
      eventId,
      email: actor.email,
    });
    if (existing) {
      return NextResponse.json({
        registration: {
          id: String(existing._id),
          eventId,
          eventTitle: String(existing.eventTitle || eventTitle),
          status: String(existing.status || "joined"),
        },
        duplicate: true,
      });
    }

    const now = new Date().toISOString();
    const user = await userDb.collection("users").findOne({ email: actor.email });
    const files = Array.isArray(body.files)
      ? (body.files as Array<Record<string, unknown>>)
          .slice(0, 5)
          .map((file, index) => ({
            id: String(file.id || `file-${index + 1}`),
            name: String(file.name || `File ${index + 1}`),
            fileName: String(file.fileName || file.name || ""),
            mimeType: String(file.mimeType || ""),
            base64: String(file.base64 || "").slice(0, 700_000),
            status: String(file.status || "pending"),
            uploaded: true,
          }))
      : [];
    const status = files.length ? "pending" : String(body.status || "joined");
    const doc = {
      eventId,
      eventTitle,
      email: actor.email,
      userName: actor.name,
      userId: actor.userId || "",
      studentNumber: actor.studentNumber || String(user?.studentNumber || ""),
      course: String(user?.course || ""),
      school: String(user?.school || ""),
      organization: String(user?.organizationPart || ""),
      organizationRole: String(user?.organizationRole || ""),
      status,
      files,
      createdAt: now,
      updatedAt: now,
    };
    const result = await registrationsCollection(userDb).insertOne(doc);

    await invitationsCollection(userDb).updateMany(
      { eventId, email: actor.email },
      { $set: { status: "joined", updatedAt: now } },
    );

    // Feed admin crowd prediction / AI insights immediately.
    if (status === "joined" || status === "approved") {
      await bumpEventRegistrationCount(eventId, 1);
    }

    void logUserActivity({
      type: "event_joined",
      actorEmail: actor.email,
      actorName: actor.name,
      actorRole: actor.role,
      targetId: eventId,
      targetTitle: eventTitle,
      meta: { kind: "registration", status },
    });

    if (event.organizerEmail) {
      void notifyUser({
        email: String(event.organizerEmail),
        title: "New event registration",
        body: `${actor.name} registered for ${eventTitle}.`,
        type: "registration",
        eventId,
        eventTitle,
      });
    }

    // Surface joins to admins so live crowd prediction stays current.
    void notifyAdmins({
      title: "New event registration",
      body: `${actor.name} joined ${eventTitle}. Registration count updated for crowd prediction.`,
      type: `registration:${eventId}:${actor.email}`,
      eventId,
      eventTitle,
    });

    return NextResponse.json(
      {
        registration: { id: String(result.insertedId), ...doc },
        crowdPrediction: {
          eventId,
          counted: status === "joined" || status === "approved",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to register for event.", details },
      { status: 500 },
    );
  }
}
