import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { notificationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

function isReminder(doc: { type?: string; title?: string }) {
  const type = String(doc.type || "").toLowerCase();
  const title = String(doc.title || "").toLowerCase();
  return type.includes("reminder") || title.includes("reminder");
}

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tab = String(searchParams.get("tab") || "general").toLowerCase();
    const db = await getUserDb();
    const docs = await notificationsCollection(db)
      .find({ email: actor.email })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const filtered = docs.filter((doc) => {
      const archived = Boolean(doc.archived);
      const reminder = isReminder(doc);
      if (tab === "archived") return archived;
      if (tab === "reminders") return reminder && !archived;
      return !archived;
    });

    return NextResponse.json({
      notifications: filtered.map((doc) => ({
        id: String(doc._id),
        title: String(doc.title || "Notification"),
        body: String(doc.body || ""),
        type: String(doc.type || "update"),
        eventId: String(doc.eventId || ""),
        eventTitle: String(doc.eventTitle || ""),
        read: Boolean(doc.read),
        archived: Boolean(doc.archived),
        isReminder: isReminder(doc),
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

  let body: { id?: string; read?: boolean; archived?: boolean; markAllRead?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const col = notificationsCollection(db);
    if (body.markAllRead) {
      await col.updateMany({ email: actor.email, read: { $ne: true } }, { $set: { read: true } });
      return NextResponse.json({ ok: true });
    }

    const id = String(body.id || "").trim();
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    }

    const update: Record<string, boolean> = {};
    if (typeof body.read === "boolean") update.read = body.read;
    if (typeof body.archived === "boolean") update.archived = body.archived;
    if (!Object.keys(update).length) {
      update.read = body.read !== false;
    }

    await col.updateOne({ _id: new ObjectId(id), email: actor.email }, { $set: update });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update notification.", details },
      { status: 500 },
    );
  }
}
