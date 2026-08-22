import { NextResponse } from "next/server";
import {
  certificatesCollection,
  logUserActivity,
} from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { eventsCollection } from "@/lib/events/types";
import {
  createCertificateDoc,
  certificateDownloadUrl,
} from "@/lib/user-server/certificates";

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
    const email = searchParams.get("email");
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = eventId;
    if (!isAdmin && actor && !("error" in actor)) {
      filter.email = actor.email;
    } else if (isAdmin && email) {
      filter.email = email.trim().toLowerCase();
    }

    const docs = await certificatesCollection(db)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return NextResponse.json({
      certificates: docs.map((doc) => ({
        id: String(doc._id),
        name: String(doc.name || "Certificate of Participation"),
        eventId: String(doc.eventId || ""),
        eventName: String(doc.eventName || doc.eventTitle || ""),
        email: String(doc.email || ""),
        userName: String(doc.userName || ""),
        studentNumber: String(doc.studentNumber || ""),
        course: String(doc.course || ""),
        school: String(doc.school || ""),
        dateIssued: String(doc.dateIssued || doc.createdAt || ""),
        status: String(doc.status || "generated"),
        category: String(doc.category || "cert-month"),
        downloadUrl: certificateDownloadUrl(String(doc._id)),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load certificates.", details },
      { status: 500 },
    );
  }
}

/** Admin generates certificates for an event's attendees (or organizer). */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { eventId?: string; email?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(eventId)) {
      return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
    }

    const event = await eventsCollection(db).findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const email = String(body.email || "").trim().toLowerCase();
    // If email provided, generate one; otherwise generate for all attendance on event.
    const targets: Array<{ email: string; userName: string }> = [];
    if (email) {
      targets.push({
        email,
        userName: String(body.name || email),
      });
    } else {
      const attendees = await db
        .collection("attendance_records")
        .find({ eventId })
        .toArray();
      const seen = new Set<string>();
      for (const row of attendees) {
        const em = String(row.email || "").toLowerCase();
        if (!em || seen.has(em)) continue;
        seen.add(em);
        targets.push({
          email: em,
          userName: String(row.participantName || row.userName || em),
        });
      }
      if (!targets.length && event.organizerEmail) {
        targets.push({
          email: String(event.organizerEmail),
          userName: String(event.organizerName || event.organizerEmail),
        });
      }
    }

    const created = [];
    for (const target of targets) {
      const existing = await certificatesCollection(db).findOne({
        eventId,
        email: target.email,
      });
      if (existing) {
        continue;
      }
      created.push(
        await createCertificateDoc({
          db,
          event: {
            id: eventId,
            title: String(event.title || ""),
            startsAt: String(event.startsAt || ""),
            certificateTemplateBase64: String(
              event.certificateTemplateBase64 || "",
            ),
          },
          recipient: target,
          generatedBy: auth.session,
          qualificationSource: "admin",
        }),
      );
    }

    return NextResponse.json({ certificates: created }, { status: 201 });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate certificates.", details },
      { status: 500 },
    );
  }
}
