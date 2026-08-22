import { NextResponse } from "next/server";
import { logUserActivity, feedbackCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const db = await getUserDb();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const mine = searchParams.get("mine") !== "0";
    const email = searchParams.get("email");
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = eventId;
    if (email) filter.email = email.trim().toLowerCase();
    else if (mine && !eventId) filter.email = actor.email;
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

  const now = new Date().toISOString();
  const doc = {
    title,
    type: String(body.type || "General Feedback").trim() || "General Feedback",
    rating,
    comment: String(body.comment || "").trim(),
    eventId: String(body.eventId || "").trim(),
    eventTitle: String(body.eventName || "").trim(),
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
