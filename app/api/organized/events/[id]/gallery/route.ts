import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  insertEventGalleryPhoto,
  listEventGalleryPhotos,
} from "@/lib/events/event-gallery";
import { eventsCollection } from "@/lib/events/types";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";

type RouteContext = { params: Promise<{ id: string }> };

async function requireOrganizer(eventId: string, email: string, userId?: string) {
  const db = await getUserDb();
  if (!ObjectId.isValid(eventId)) return { error: "Invalid event id.", status: 400 } as const;
  const event = await eventsCollection(db).findOne({ _id: new ObjectId(eventId) });
  if (!event) return { error: "Event not found.", status: 404 } as const;
  const owns = event.organizerEmail === email || (userId && event.organizerId === userId);
  if (!owns) return { error: "Forbidden.", status: 403 } as const;
  return { db, event };
}

export async function GET(request: Request, context: RouteContext) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  const { id } = await context.params;
  const owned = await requireOrganizer(id, actor.email, actor.userId);
  if ("error" in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  try {
    const photos = await listEventGalleryPhotos(owned.db, id, {
      includeArchived: false,
      limit: 80,
    });
    return NextResponse.json({ photos });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load gallery.", details }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  const { id } = await context.params;
  const owned = await requireOrganizer(id, actor.email, actor.userId);
  if ("error" in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  let body: { dataUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const dataUrl = String(body.dataUrl || "").trim();
  if (!dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "An image data URL is required." }, { status: 400 });
  }

  try {
    const photo = await insertEventGalleryPhoto(owned.db, {
      eventId: id,
      dataUrl,
      uploadedByEmail: actor.email,
      source: "organizer",
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to save photo.", details }, { status: 500 });
  }
}
