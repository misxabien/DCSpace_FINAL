import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  insertEventGalleryPhoto,
  listEventGalleryPhotos,
} from "@/lib/events/event-gallery";
import { eventsCollection } from "@/lib/events/types";
import { getUserDb } from "@/lib/user-server/get-user-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("includeArchived") === "1";

  try {
    const db = await getUserDb();
    const event = await eventsCollection(db).findOne({ _id: new ObjectId(id) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const photos = await listEventGalleryPhotos(db, id, {
      includeArchived,
      limit: 80,
    });
    return NextResponse.json({ photos });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load event photos.", details },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  let body: { dataUrl?: string; caption?: string };
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
    const db = await getUserDb();
    const event = await eventsCollection(db).findOne({ _id: new ObjectId(id) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const photo = await insertEventGalleryPhoto(db, {
      eventId: id,
      dataUrl,
      uploadedByEmail: auth.session.email,
      source: "admin",
      caption: String(body.caption || "").trim(),
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to upload event photo.", details },
      { status: 500 },
    );
  }
}
