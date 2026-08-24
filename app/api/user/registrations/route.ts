import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { usersCollection } from "@/lib/db/user-collections";
import { logUserActivity } from "@/lib/user-server/activity";
import {
  invitationsCollection,
  notifyAdmins,
  notifyUser,
  registrationsCollection,
} from "@/lib/user-server/portal";
import { isPublicEventStatus } from "@/lib/events/public-status";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

export async function GET(request: Request) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const userDb = await getUserDb();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const email = searchParams.get("email");
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = eventId;
    if (isAdmin) {
      if (email) filter.email = email.trim().toLowerCase();
    } else if (actor && !("error" in actor)) {
      // Only this account's registrations — never another user's.
      filter.email = actor.email.trim().toLowerCase();
    }
    const docs = await registrationsCollection(userDb)
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

  let body: { eventId?: string; eventTitle?: string; status?: string };
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
    const adminDb = await getAdminDb();
    const event = ObjectId.isValid(eventId)
      ? await eventsCollection(adminDb).findOne({ _id: new ObjectId(eventId) })
      : null;
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (!isPublicEventStatus(event.status)) {
      return NextResponse.json(
        { error: "This event is not open for registration yet." },
        { status: 403 },
      );
    }
    const eventTitle =
      String(body.eventTitle || "").trim() || String(event.title || "Event");

    const email = actor.email.trim().toLowerCase();
    const existing = await registrationsCollection(userDb).findOne({
      eventId,
      email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (existing) {
      const registrationCount = await registrationsCollection(userDb).countDocuments({ eventId });
      return NextResponse.json({
        registration: {
          id: String(existing._id),
          eventId,
          eventTitle: String(existing.eventTitle || eventTitle),
          status: String(existing.status || "joined"),
        },
        registrationCount,
        duplicate: true,
      });
    }

    const now = new Date().toISOString();
    const user = await usersCollection(userDb).findOne({ email: actor.email });
    const files = Array.isArray((body as { files?: unknown }).files)
      ? ((body as { files?: Array<Record<string, unknown>> }).files || [])
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
      email: email,
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
      { eventId, email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
      { $set: { status: "joined", updatedAt: now } },
    );

    await logUserActivity({
      type: "event_submitted",
      actorEmail: actor.email,
      actorName: actor.name,
      actorRole: actor.role,
      targetId: eventId,
      targetTitle: eventTitle,
      meta: { kind: "registration", status },
    });

    const registrationCount = await registrationsCollection(userDb).countDocuments({ eventId });

    if (event?.organizerEmail) {
      await notifyUser({
        email: String(event.organizerEmail),
        title: "New event registration",
        body: `${actor.name} registered for ${eventTitle}. Expected attendees: ${registrationCount}.`,
        type: "registration",
        eventId,
        eventTitle,
      });
    }

    void notifyAdmins({
      title: "Student registered for event",
      body: `${actor.name} joined ${eventTitle}. Registered students: ${registrationCount}.`,
      type: "registration",
      eventId,
      eventTitle,
    });

    return NextResponse.json(
      {
        registration: { id: String(result.insertedId), ...doc },
        registrationCount,
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
