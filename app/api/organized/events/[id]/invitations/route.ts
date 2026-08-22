import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { invitationsCollection, notifyUser } from "@/lib/user-server/portal";
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
    const docs = await invitationsCollection(owned.db)
      .find({ eventId: id })
      .sort({ createdAt: -1 })
      .limit(400)
      .toArray();
    return NextResponse.json({
      invitations: docs.map((doc) => ({
        id: String(doc._id),
        eventId: String(doc.eventId || ""),
        email: String(doc.email || ""),
        userId: String(doc.userId || ""),
        userName: String(doc.userName || ""),
        studentNumber: String(doc.studentNumber || ""),
        course: String(doc.course || ""),
        organization: String(doc.organization || ""),
        audience: String(doc.audience || "student"),
        status: String(doc.status || "pending"),
        createdAt: String(doc.createdAt || ""),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load invitations.", details },
      { status: 500 },
    );
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

  let body: {
    email?: string;
    emails?: string[];
    userId?: string;
    userName?: string;
    studentNumber?: string;
    course?: string;
    organization?: string;
    audience?: string;
    invited?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const emails = Array.from(
    new Set(
      [body.email, ...(Array.isArray(body.emails) ? body.emails : [])]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (!emails.length) {
    return NextResponse.json({ error: "email is required." }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const created = [];
    for (const email of emails) {
      if (body.invited === false) {
        await invitationsCollection(owned.db).deleteMany({ eventId: id, email });
        continue;
      }
      const existing = await invitationsCollection(owned.db).findOne({ eventId: id, email });
      if (existing) {
        created.push({ id: String(existing._id), email, status: existing.status });
        continue;
      }
      const user = await owned.db.collection("users").findOne({ email });
      const doc = {
        eventId: id,
        eventTitle: String(owned.event.title || ""),
        email,
        userId: String(body.userId || user?._id || ""),
        userName:
          String(body.userName || "").trim() ||
          `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
          email,
        studentNumber: String(body.studentNumber || user?.studentNumber || ""),
        course: String(body.course || user?.course || ""),
        organization: String(body.organization || user?.organizationPart || ""),
        audience: String(body.audience || (user?.role === "faculty" ? "faculty" : "student")),
        status: "pending",
        invitedByEmail: actor.email,
        createdAt: now,
      };
      const result = await invitationsCollection(owned.db).insertOne(doc);
      created.push({ id: String(result.insertedId), ...doc });
      await notifyUser({
        email,
        userId: String(doc.userId || ""),
        title: "You're invited to an event",
        body: `You were invited to ${owned.event.title}.`,
        type: "invitation",
        eventId: id,
        eventTitle: String(owned.event.title || ""),
      });
    }
    return NextResponse.json({ invitations: created }, { status: 201 });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to send invitations.", details },
      { status: 500 },
    );
  }
}
