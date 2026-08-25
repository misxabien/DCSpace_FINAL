import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { setEventGalleryPhotoArchived } from "@/lib/events/event-gallery";
import { getUserDb } from "@/lib/user-server/get-user-db";

type RouteContext = { params: Promise<{ id: string; photoId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id, photoId } = await context.params;
  if (!ObjectId.isValid(id) || !ObjectId.isValid(photoId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let body: { archived?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.archived !== "boolean") {
    return NextResponse.json({ error: "archived boolean is required." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const photo = await setEventGalleryPhotoArchived(db, {
      eventId: id,
      photoId,
      archived: body.archived,
      archivedByEmail: auth.session.email,
    });
    if (!photo) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }
    return NextResponse.json({ photo });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update photo.", details },
      { status: 500 },
    );
  }
}
