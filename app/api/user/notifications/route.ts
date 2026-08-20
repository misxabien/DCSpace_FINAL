import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { notificationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const db = await getUserDb();
    const docs = await notificationsCollection(db)
      .find({ email: actor.email })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      notifications: docs.map((doc) => ({
        id: String(doc._id),
        title: String(doc.title || "Notification"),
        body: String(doc.body || ""),
        type: String(doc.type || "update"),
        eventId: String(doc.eventId || ""),
        eventTitle: String(doc.eventTitle || ""),
        read: Boolean(doc.read),
        createdAt: String(doc.createdAt || ""),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load notifications.", details },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body: { id?: string; read?: boolean; markAllRead?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const col = notificationsCollection(db);
    if (body.markAllRead) {
      await col.updateMany({ email: actor.email }, { $set: { read: true } });
      return NextResponse.json({ ok: true });
    }

    const id = String(body.id || "").trim();
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    }

    await col.updateOne(
      { _id: new ObjectId(id), email: actor.email },
      { $set: { read: body.read !== false } },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update notification.", details },
      { status: 500 },
    );
  }
}
