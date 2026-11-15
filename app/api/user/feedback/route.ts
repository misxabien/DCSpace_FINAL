import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { logUserActivity, feedbackCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { registrationsCollection } from "@/lib/user-server/portal";
import { findEventById } from "@/lib/events/find-event";

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
    const mine = searchParams.get("mine") !== "0";
    const emailParam = searchParams.get("email");
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = eventId;
    if (isAdmin && emailParam) {
      filter.email = emailParam.trim().toLowerCase();
    } else if (mine && !eventId && actor && !("error" in actor)) {
      filter.email = actor.email;
    } else if (!isAdmin && actor && !("error" in actor)) {
      filter.email = actor.email;
    }
    const docs = await feedbackCollection(db)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      feedback: docs.map((doc) => ({
        id: String(doc._id),
        title: String(doc.title || ""),
        type: String(doc.type || "General Feedback"),
        rating: Number(doc.rating || 0),
        comment: String(doc.comment || ""),
        media: Array.isArray(doc.media) ? doc.media : [],
        eventId: String(doc.eventId || ""),
        eventName: String(doc.eventTitle || doc.eventName || ""),
        email: String(doc.email || ""),
        userName: String(doc.userName || ""),
        createdAt: String(doc.createdAt || ""),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load feedback.", details },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body: {
    title?: string;
    type?: string;
    rating?: number;
    comment?: string;
    eventId?: string;
    eventName?: string;
    media?: Array<{ name?: string; mimeType?: string; dataUrl?: string }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  const rating = Number(body.rating || 0);
  if (!title) {
    return NextResponse.json({ error: "Feedback title is required." }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be 1–5." }, { status: 400 });
  }

  const rawType = String(body.type || "General Feedback").trim() || "General Feedback";
  const isSystem = rawType.toLowerCase() === "system" || rawType.toLowerCase() === "system feedback";
  const eventId = isSystem ? "" : String(body.eventId || "").trim();

  // Event surveys: phase comes from the event itself — mid-event while it is
  // live, post-event once completed — and only registered participants answer.
  let phase: "mid-event" | "post-event" | "" = "";
  let eventTitle = String(body.eventName || "").trim();
  if (eventId) {
    const { event } = await findEventById(eventId).catch(() => ({ event: null }));
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    eventTitle = String(event.title || eventTitle);
    if (event.status === "live") phase = "mid-event";
    else if (event.status === "completed") phase = "post-event";
    else {
      return NextResponse.json(
        { error: "Event surveys open once the event is live (mid-event) or completed (post-event)." },
        { status: 409 },
      );
    }
    const db = await getUserDb();
    const registered = await registrationsCollection(db).findOne({
      eventId,
      email: actor.email,
      status: { $in: ["joined", "approved"] },
    });
    if (!registered) {
      return NextResponse.json(
        { error: "Only registered participants can answer this event survey." },
        { status: 403 },
      );
    }
    const already = await feedbackCollection(db).findOne({ eventId, email: actor.email, phase });
    if (already) {
      return NextResponse.json(
        { error: `You already submitted the ${phase} survey for this event.` },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const doc = {
    title,
    type: isSystem ? "System Feedback" : rawType,
    /** "event" | "system" | "general" — Super Admin reviews "system". */
    category: isSystem ? "system" : eventId ? "event" : "general",
    phase,
    /** Workflow for system feedback: new → reviewing → resolved / archived. */
    status: isSystem ? "new" : "",
    rating,
    comment: String(body.comment || "").trim(),
    eventId,
    eventTitle,
    email: actor.email,
    userName: actor.name,
    userId: actor.userId || "",
    media: Array.isArray(body.media)
      ? body.media
          .slice(0, 6)
          .map((item) => ({
            name: String(item.name || "photo").trim(),
            mimeType: String(item.mimeType || "image/jpeg"),
            dataUrl: String(item.dataUrl || "").trim(),
          }))
          .filter((item) => item.dataUrl.startsWith("data:image/"))
      : [],
    createdAt: now,
  };

  try {
    const db = await getUserDb();
    const result = await feedbackCollection(db).insertOne(doc);
    await logUserActivity({
      type: "feedback_submitted",
      actorEmail: actor.email,
      actorName: actor.name,
      actorRole: actor.role,
      targetId: doc.eventId,
      targetTitle: doc.eventTitle || doc.title,
      meta: { rating: doc.rating, feedbackId: String(result.insertedId) },
    });

    return NextResponse.json(
      {
        feedback: {
          id: String(result.insertedId),
          ...doc,
          eventName: doc.eventTitle,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to submit feedback.", details },
      { status: 500 },
    );
  }
}
