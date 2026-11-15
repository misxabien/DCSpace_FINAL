import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/db/get-db";
import { eventGalleryCollection } from "@/lib/db/user-collections";
import { findEventById } from "@/lib/events/find-event";
import { registrationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

type RouteContext = { params: Promise<{ id: string }> };

/** ~5 MB of base64 image data per photo. */
const MAX_PHOTO_DATA_URL = 7_000_000;

async function requireParticipant(eventId: string, email: string) {
  if (!ObjectId.isValid(eventId)) return { error: "Invalid event id.", status: 400 } as const;
  const { event } = await findEventById(eventId);
  if (!event) return { error: "Event not found.", status: 404 } as const;
  const userDb = await getUserDb();
  const registered = await registrationsCollection(userDb).findOne({
    eventId,
    email,
    status: { $in: ["joined", "approved"] },
  });
  if (!registered) {
    return { error: "Only registered participants can share event photos.", status: 403 } as const;
  }
  return { event, userDb };
}

/** Photos the signed-in participant uploaded for this event. */
export async function GET(request: Request, context: RouteContext) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  const { id } = await context.params;
  const access = await requireParticipant(id, actor.email);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const docs = await eventGalleryCollection(access.userDb)
    .find({ eventId: id, uploadedByEmail: actor.email })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return NextResponse.json({
    allowParticipantPhotos: access.event.allowParticipantPhotos === true,
    photos: docs.map((doc) => ({
      id: String(doc._id),
      dataUrl: String(doc.dataUrl || ""),
      uploadedAt: String(doc.createdAt || ""),
    })),
  });
}

/** Registered participants upload a photo when the organizer allows it. */
export async function POST(request: Request, context: RouteContext) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  const { id } = await context.params;
  const access = await requireParticipant(id, actor.email);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.event.allowParticipantPhotos !== true) {
    return NextResponse.json(
      { error: "The organizer has not enabled photo uploads for this event." },
      { status: 403 },
    );
  }
  if (!["live", "completed"].includes(String(access.event.status))) {
    return NextResponse.json(
      { error: "Photos can be shared once the event has started." },
      { status: 409 },
    );
  }

  let body: { dataUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const dataUrl = String(body.dataUrl || "").trim();
  if (!dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "An image is required." }, { status: 400 });
  }
  if (dataUrl.length > MAX_PHOTO_DATA_URL) {
    return NextResponse.json({ error: "Photo is too large (max 5 MB)." }, { status: 413 });
  }

  const count = await eventGalleryCollection(access.userDb).countDocuments({
    eventId: id,
    uploadedByEmail: actor.email,
  });
  if (count >= 10) {
    return NextResponse.json(
      { error: "You can share up to 10 photos per event." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const result = await eventGalleryCollection(access.userDb).insertOne({
    eventId: id,
    dataUrl,
    uploadedByEmail: actor.email,
    uploadedByName: actor.name,
    source: "participant",
    createdAt: now,
  });
  return NextResponse.json(
    { photo: { id: String(result.insertedId), dataUrl, uploadedAt: now } },
    { status: 201 },
  );
}
