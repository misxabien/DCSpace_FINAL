import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  attendanceCollection,
  certificatesCollection,
} from "@/lib/user-server/activity";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
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

type IssueTarget = {
  email: string;
  userName: string;
  studentNumber?: string;
  course?: string;
  school?: string;
};

/** Admin issues certificates for an event template — one user or selected/all attendees. */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    eventId?: string;
    email?: string;
    name?: string;
    emails?: string[];
    regenerate?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }
  if (!ObjectId.isValid(eventId)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const userDb = await getUserDb();
    const adminDb = await getAdminDb();
    const event = await eventsCollection(adminDb).findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (!event.certificateTemplateBase64) {
      return NextResponse.json(
        {
          error:
            "This event has no certificate template. Upload an e-certificate template on the event first.",
        },
        { status: 400 },
      );
    }

    const regenerate = Boolean(body.regenerate);
    const requestedEmails = Array.isArray(body.emails)
      ? body.emails.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const singleEmail = String(body.email || "").trim().toLowerCase();
    if (singleEmail) requestedEmails.unshift(singleEmail);

    const uniqueRequested = [...new Set(requestedEmails)];
    const targets: IssueTarget[] = [];

    if (uniqueRequested.length) {
      for (const email of uniqueRequested) {
        const user = await userDb.collection("users").findOne({ email });
        const attendance = await attendanceCollection(userDb)
          .find({ eventId, email })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();
        const fromAttendance = attendance.find((row) => row.participantName || row.userName);
        const fullName = user
          ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
          : "";
        const explicitName =
          uniqueRequested.length === 1 ? String(body.name || "").trim() : "";
        targets.push({
          email,
          userName:
            explicitName ||
            fullName ||
            String(fromAttendance?.participantName || fromAttendance?.userName || "") ||
            email,
          studentNumber: String(user?.studentNumber || fromAttendance?.studentNumber || ""),
          course: String(user?.course || fromAttendance?.course || ""),
          school: String(user?.school || ""),
        });
      }
    } else {
      // Bulk: attendees who tapped in (prefer those with a profile name).
      const attendees = await attendanceCollection(userDb)
        .find({ eventId, action: "in" })
        .sort({ createdAt: 1 })
        .toArray();
      const seen = new Set<string>();
      for (const row of attendees) {
        const email = String(row.email || "").toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        const user = await userDb.collection("users").findOne({ email });
        const fullName = user
          ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
          : "";
        targets.push({
          email,
          userName:
            fullName ||
            String(row.participantName || row.userName || email),
          studentNumber: String(user?.studentNumber || row.studentNumber || ""),
          course: String(user?.course || row.course || ""),
          school: String(user?.school || ""),
        });
      }
    }

    if (!targets.length) {
      return NextResponse.json(
        {
          error:
            "No recipients found. Select a participant or record attendance for this event first.",
        },
        { status: 400 },
      );
    }

    const created = [];
    const skipped = [];
    for (const target of targets) {
      const existing = await certificatesCollection(userDb).findOne({
        eventId,
        email: target.email,
      });
      if (existing && !regenerate) {
        skipped.push({
          email: target.email,
          userName: target.userName,
          id: String(existing._id),
          downloadUrl: certificateDownloadUrl(String(existing._id)),
        });
        continue;
      }
      if (existing && regenerate) {
        await certificatesCollection(userDb).deleteOne({ _id: existing._id });
      }

      const doc = await createCertificateDoc({
        db: userDb,
        event: {
          id: eventId,
          title: String(event.title || ""),
          startsAt: String(event.startsAt || ""),
          certificateTemplateBase64: String(event.certificateTemplateBase64 || ""),
        },
        recipient: {
          email: target.email,
          userName: target.userName,
        },
        generatedBy: auth.session,
        qualificationSource: "admin",
      });

      // Enrich stored certificate with school identity fields for admin tables.
      await certificatesCollection(userDb).updateOne(
        { _id: new ObjectId(doc.id) },
        {
          $set: {
            studentNumber: target.studentNumber || "",
            course: target.course || "",
            school: target.school || "",
          },
        },
      );

      created.push({
        ...doc,
        studentNumber: target.studentNumber || "",
        course: target.course || "",
        school: target.school || "",
      });
    }

    return NextResponse.json(
      {
        certificates: created,
        skipped,
        message: `Issued ${created.length} certificate(s) for "${event.title}".${
          skipped.length ? ` ${skipped.length} already had a certificate.` : ""
        }`,
      },
      { status: created.length ? 201 : 200 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate certificates.", details },
      { status: 500 },
    );
  }
}
