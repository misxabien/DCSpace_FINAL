import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { requireAdminPermission } from "@/lib/admin-server/admin-permissions";
import { findEventById } from "@/lib/events/find-event";
import { sanitizeEvent } from "@/lib/events/types";
import { attendanceRequirementLabel, gracePeriodLabel } from "@/lib/events/map-event";
import { courseLabel } from "@/lib/labels/academic";
import { eventsCollection } from "@/lib/events/types";
import { contentDisposition } from "@/lib/http/content-disposition";
import {
  buildEventFeedbackCsv,
  buildEventFeedbackPdf,
  feedbackExportFileName,
} from "@/lib/admin/event-feedback-export";

type RouteContext = { params: Promise<{ id: string }> };

/** Admin switch on the Feedback Details page; "open" unless paused/closed. */
const FEEDBACK_STATUSES = ["open", "paused", "closed"] as const;
type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
const readFeedbackStatus = (doc: unknown): FeedbackStatus => {
  const value = String((doc as { feedbackStatus?: unknown })?.feedbackStatus || "").toLowerCase();
  return (FEEDBACK_STATUSES as readonly string[]).includes(value) ? (value as FeedbackStatus) : "open";
};

export const dynamic = "force-dynamic";

type PhaseEntry = {
  at: string;
  rating: number;
  title: string;
  type: string;
  comment: string;
};

/**
 * One event's real feedback for the admin "Feedback Details" page and a
 * participant's "Responses" page: event info, per-phase summary, and one row
 * per participant (registered or responded) with their mid/post submissions.
 * Optional ?email= returns just that participant.
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const denied = await requireAdminPermission(auth, "view-feedback");
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }
  const searchParams = new URL(request.url).searchParams;
  const onlyEmail = String(searchParams.get("email") || "").trim().toLowerCase();
  const format = String(searchParams.get("format") || "").toLowerCase();

  try {
    const { event: doc, userDb } = await findEventById(id);
    if (!doc) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    const event = sanitizeEvent(doc as Parameters<typeof sanitizeEvent>[0]) as Record<string, unknown>;

    const [registrations, feedback] = await Promise.all([
      userDb
        .collection("event_registrations")
        .find(
          { eventId: id, status: { $nin: ["cancelled", "canceled", "rejected", "declined"] } },
          { projection: { email: 1, userName: 1, course: 1 } },
        )
        .limit(2000)
        .toArray(),
      userDb
        .collection("feedback_entries")
        .find(
          { eventId: id, phase: { $in: ["mid-event", "post-event"] } },
          { projection: { email: 1, userName: 1, phase: 1, rating: 1, title: 1, type: 1, comment: 1, createdAt: 1 } },
        )
        .sort({ createdAt: 1 })
        .limit(5000)
        .toArray(),
    ]);

    type Row = { email: string; name: string; course: string; mid: PhaseEntry | null; post: PhaseEntry | null };
    const rows = new Map<string, Row>();
    const ensure = (emailRaw: unknown, name: unknown, course: unknown) => {
      const email = String(emailRaw || "").trim().toLowerCase();
      if (!email) return null;
      let row = rows.get(email);
      if (!row) {
        row = { email, name: String(name || "").trim() || email, course: String(course || ""), mid: null, post: null };
        rows.set(email, row);
      }
      return row;
    };
    for (const reg of registrations) ensure(reg.email, reg.userName, reg.course);
    for (const entry of feedback) {
      const row = ensure(entry.email, entry.userName, "");
      if (!row) continue;
      const item: PhaseEntry = {
        at: String(entry.createdAt || ""),
        rating: Number(entry.rating || 0),
        title: String(entry.title || ""),
        type: String(entry.type || ""),
        comment: String(entry.comment || ""),
      };
      // Latest submission per phase wins.
      if (entry.phase === "mid-event") row.mid = item;
      else row.post = item;
    }

    // Real names and courses from the accounts.
    const emails = [...rows.keys()];
    if (emails.length) {
      const users = await userDb
        .collection("users")
        .find({ email: { $in: emails } }, { projection: { email: 1, firstName: 1, lastName: 1, course: 1 } })
        .toArray();
      for (const user of users) {
        const row = rows.get(String(user.email || "").toLowerCase());
        if (!row) continue;
        const full = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        if (full) row.name = full;
        if (user.course) row.course = String(user.course);
      }
    }

    const all = [...rows.values()]
      .map((row) => ({ ...row, course: courseLabel(row.course) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const registered = registrations.length;
    const summarize = (key: "mid" | "post") => {
      const done = all.filter((row) => row[key]);
      const ratings = done.map((row) => row[key]!.rating).filter((n) => n > 0);
      const average = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
      return {
        responses: done.length,
        averageRating: average,
        responseRate: registered ? Math.min(100, Math.round((done.length / registered) * 100)) : null,
      };
    };

    const feedbackStatus = readFeedbackStatus(doc);
    if (format === "csv" || format === "pdf") {
      const input = {
        event: {
          title: String(event.title || ""),
          startsAt: String(event.startsAt || ""),
          venue: String(event.reservationRoomName || event.location || ""),
          status: String(event.status || ""),
        },
        feedbackStatus,
        registered,
        midEvent: summarize("mid"),
        postEvent: summarize("post"),
        participants: all,
      };
      const title = String(event.title || "event");
      const body = format === "csv" ? buildEventFeedbackCsv(input) : await buildEventFeedbackPdf(input);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
          "Content-Disposition": contentDisposition("attachment", feedbackExportFileName(title, format as "csv" | "pdf")),
          "Cache-Control": "private, no-store",
        },
      });
    }

    return NextResponse.json({
      feedbackStatus,
      event: {
        id,
        title: String(event.title || ""),
        description: String(event.description || ""),
        status: String(event.status || ""),
        venue: String(event.reservationRoomName || event.location || ""),
        startsAt: String(event.startsAt || ""),
        endsAt: String(event.endsAt || ""),
        venueType: String(event.venueType || ""),
        eventType: String(event.category || ""),
        organization: String(event.department || event.organizerName || ""),
        minimumAttendance: attendanceRequirementLabel(event as never),
        gracePeriod: gracePeriodLabel(event as never),
      },
      registered,
      midEvent: summarize("mid"),
      postEvent: summarize("post"),
      participants: onlyEmail ? all.filter((row) => row.email === onlyEmail) : all,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load event feedback.", details }, { status: 500 });
  }
}

/** Open, pause or close an event's surveys (Feedback Details → Admin Actions). */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const denied = await requireAdminPermission(auth, "view-feedback");
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }
  let body: { feedbackStatus?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const next = String(body.feedbackStatus || "").toLowerCase();
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(next)) {
    return NextResponse.json({ error: "Feedback status must be open, paused or closed." }, { status: 400 });
  }

  try {
    const { event, adminDb, userDb, source } = await findEventById(id);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    const now = new Date().toISOString();
    await eventsCollection(source === "user" ? userDb : adminDb).updateOne(
      { _id: new ObjectId(id) },
      { $set: { feedbackStatus: next, feedbackStatusBy: auth.session.email, feedbackStatusAt: now } },
    );
    return NextResponse.json({ ok: true, feedbackStatus: next });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to update feedback status.", details }, { status: 500 });
  }
}
