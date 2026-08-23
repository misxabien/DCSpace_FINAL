import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { registrationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

type RouteContext = { params: Promise<{ id: string; registrationId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { id, registrationId } = await context.params;
  if (!ObjectId.isValid(id) || !ObjectId.isValid(registrationId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let body: { fileId?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fileId = String(body.fileId || "").trim();
  const status = String(body.status || "").trim();
  if (!fileId || !["pending", "accepted", "rejected"].includes(status)) {
    return NextResponse.json({ error: "fileId and a valid status are required." }, { status: 400 });
  }

  try {
    const userDb = await getUserDb();
    const adminDb = await getAdminDb();
    const event = await eventsCollection(adminDb).findOne({ _id: new ObjectId(id) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const owns = event.organizerEmail === actor.email || event.organizerId === actor.userId;
    if (!owns) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await registrationsCollection(userDb).updateOne(
      { _id: new ObjectId(registrationId), eventId: id },
      { $set: { "files.$[file].status": status, updatedAt: new Date().toISOString() } },
      { arrayFilters: [{ "file.id": fileId }] },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update registration.", details },
      { status: 500 },
    );
  }
}
