import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import {
  ensureStudentNotifications,
  notificationsCollection,
} from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { escapeRegex } from "@/lib/events/ownership";

function isReminder(doc: { type?: string; title?: string }) {
  const type = String(doc.type || "").toLowerCase();
  const title = String(doc.title || "").toLowerCase();
  return type.includes("reminder") || title.includes("reminder");
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tab = String(searchParams.get("tab") || "general").toLowerCase();
    const email = actor.email.trim().toLowerCase();
    const db = await getUserDb();

    // Backfill invitation notifications so older invites still show up.
    // Badge polls can skip this with ?light=1 to avoid overlapping heavy work.
    const light = searchParams.get("light") === "1";
    if (!light) {
      await ensureStudentNotifications(email);
    }

    const docs = await notificationsCollection(db)
      .find({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } })
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
    const email = actor.email.trim().toLowerCase();
    const db = await getUserDb();
    const col = notificationsCollection(db);
    const emailFilter = { $regex: `^${escapeRegex(email)}$`, $options: "i" };

    if (body.markAllRead) {
      await col.updateMany(
        { email: emailFilter, read: { $ne: true } },
        { $set: { read: true } },
      );
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
      update.read = true;
    }

    const existing = await col.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }
    if (normalizeEmail(String(existing.email || "")) !== email) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await col.updateOne({ _id: new ObjectId(id) }, { $set: update });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update notification.", details },
      { status: 500 },
    );
  }
}
