import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { decodeSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/types";
import {
  eventsCollection,
  sanitizeEvent,
  asStringList,
  type EventStatus,
  type SpaceEvent,
} from "@/lib/events/types";
import { parseDurationToMinutes } from "@/lib/certificates/template";
import { getAdminDb } from "@/lib/db/get-db";
import { requireUserAuth } from "@/lib/user-server/require-user-auth";
import {
  normalizeOrganizerEmail,
  organizerEmailClause,
} from "@/lib/events/ownership";
import { PUBLIC_EVENT_STATUSES } from "@/lib/events/public-status";
import { EVENT_LIST_PROJECTION } from "@/lib/events/list-projection";
import { compareEventsForDisplay } from "@/lib/events/map-event";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { usersCollection } from "@/lib/db/user-collections";

const WRITABLE_STATUSES: EventStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "postponed",
  "live",
  "completed",
  "cancelled",
];

async function resolveActor(request: Request) {
  const admin = await requireAdminAuth(request);
  if (!("error" in admin)) {
    return { kind: "admin" as const, session: admin.session };
  }

  const userAuth = await requireUserAuth(request);
  if (!("error" in userAuth)) {
    return {
      kind: "user" as const,
      user: userAuth.user,
      email: userAuth.user.email,
      name: `${userAuth.user.firstName || ""} ${userAuth.user.lastName || ""}`.trim(),
      id: String(userAuth.user._id),
    };
  }

  const jar = await cookies();
  const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (session) {
    if (session.isAdmin) {
      return { kind: "admin" as const, session };
    }
    try {
      const db = await getUserDb();
      const user = await usersCollection(db).findOne({
        email: session.email.trim().toLowerCase(),
      });
      if (user) {
        return {
          kind: "user" as const,
          user,
          email: String(user.email).trim().toLowerCase(),
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || session.name,
          id: String(user._id),
        };
      }
    } catch {
      /* fall through */
    }
    return {
      kind: "session" as const,
      session,
    };
  }

  return null;
}

/** Shared events list — admins see all; organizers see their own + approved. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const limit = Math.min(Number(searchParams.get("limit") || 200) || 200, 500);

  if (scope === "public") {
    const jar = await cookies();
    const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
    const hasBearer = Boolean(request.headers.get("authorization")?.startsWith("Bearer "));
    if (!session && !hasBearer) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
      const db = await getAdminDb();
      const docs = await eventsCollection(db)
        .find({ status: { $in: [...PUBLIC_EVENT_STATUSES] } })
        .project(EVENT_LIST_PROJECTION)
        .sort({ startsAt: 1, updatedAt: -1 })
        .limit(limit)
        .toArray();

      const events = docs
        .map((doc) => sanitizeEvent(doc as SpaceEvent & { _id: ObjectId }))
        .sort(compareEventsForDisplay);

      return NextResponse.json({ events });
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json(
        { error: "Failed to load events.", details },
        { status: 500 },
      );
    }
  }

  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const status = searchParams.get("status");

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    if (actor.kind === "user") {
      // Own events (any status) + every public event from all organizers.
      filter.$or = [
        { organizerId: actor.id },
        organizerEmailClause(actor.email),
        { status: { $in: [...PUBLIC_EVENT_STATUSES] } },
      ];
    } else if (actor.kind === "session" && !actor.session.isAdmin) {
      filter.$or = [
        organizerEmailClause(actor.session.email),
        { status: { $in: [...PUBLIC_EVENT_STATUSES] } },
      ];
    }

    const db = await getAdminDb();
    const isAdminList = actor.kind === "admin";
    const docs = await eventsCollection(db)
      .find(filter)
      .project(EVENT_LIST_PROJECTION)
      .sort(
        status === "pending" || (isAdminList && !status)
          ? { updatedAt: -1, startsAt: 1 }
          : { startsAt: 1, updatedAt: -1 },
      )
      .limit(limit)
      .toArray();

    const events = docs
      .map((doc) => sanitizeEvent(doc as SpaceEvent & { _id: ObjectId }))
      .sort(
        status === "pending"
          ? (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
          : compareEventsForDisplay,
      );

    return NextResponse.json({ events });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load events.", details },
      { status: 500 },
    );
  }
}

/** Organizers/admins create events into the shared Mongo collection. */
export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    category?: string;
    location?: string;
    startsAt?: string;
    endsAt?: string;
    attendanceRequired?: string;
    gracePeriod?: string;
    venueType?: string;
    announcements?: string;
    allowedCourses?: string[];
    requiredFiles?: string[];
    speakers?: string[];
    collaboratingDepartments?: string[];
    audienceSchools?: string[];
    programActivities?: string[];
    department?: string;
    certificateTemplateName?: string;
    certificateTemplateMimeType?: string;
    certificateTemplateBase64?: string;
    conceptPaperName?: string;
    conceptPaperMimeType?: string;
    conceptPaperBase64?: string;
    programFileName?: string;
    programFileMimeType?: string;
    programFileBase64?: string;
    programFileVisibility?: "everyone" | "organizers";
    posterImageBase64?: string;
    posterImageMimeType?: string;
    status?: EventStatus;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Event title is required." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const attendanceRequired = String(body.attendanceRequired || "").trim();
  const gracePeriod = String(body.gracePeriod || "").trim();
  const certificateTemplateName = String(body.certificateTemplateName || "").trim();
  const certificateTemplateMimeType = String(
    body.certificateTemplateMimeType || "",
  ).trim();
  const certificateTemplateBase64 = String(
    body.certificateTemplateBase64 || "",
  ).trim();
  const conceptPaperName = String(body.conceptPaperName || "").trim();
  const conceptPaperMimeType = String(body.conceptPaperMimeType || "").trim();
  const conceptPaperBase64 = String(body.conceptPaperBase64 || "").trim();
  const programFileName = String(body.programFileName || "").trim();
  const programFileMimeType = String(body.programFileMimeType || "").trim();
  const programFileBase64 = String(body.programFileBase64 || "").trim();
  const programFileVisibility =
    body.programFileVisibility === "organizers" ? "organizers" : "everyone";
  const status: EventStatus =
    body.status && WRITABLE_STATUSES.includes(body.status)
      ? body.status
      : actor.kind === "admin"
        ? "approved"
        : "pending";

  const doc: SpaceEvent = {
    title,
    description: String(body.description || "").trim(),
    category: String(body.category || "").trim(),
    location: String(body.location || "").trim(),
    startsAt: String(body.startsAt || "").trim(),
    endsAt: String(body.endsAt || "").trim(),
    attendanceRequired,
    attendanceRequiredMinutes:
      parseDurationToMinutes(attendanceRequired) || undefined,
    gracePeriod,
    gracePeriodMinutes: parseDurationToMinutes(gracePeriod) || undefined,
    venueType: String(body.venueType || "").trim(),
    announcements: String(body.announcements || "").trim(),
    allowedCourses: asStringList(body.allowedCourses),
    requiredFiles: asStringList(body.requiredFiles),
    speakers: asStringList(body.speakers),
    collaboratingDepartments: asStringList(body.collaboratingDepartments),
    audienceSchools: asStringList(body.audienceSchools),
    programActivities: asStringList(body.programActivities),
    department: String(body.department || "").trim(),
    certificateTemplateName,
    certificateTemplateMimeType,
    certificateTemplateBase64,
    conceptPaperName,
    conceptPaperMimeType,
    conceptPaperBase64,
    programFileName,
    programFileMimeType,
    programFileBase64,
    programFileVisibility,
    posterImageBase64: String(body.posterImageBase64 || "").trim(),
    posterImageMimeType: String(body.posterImageMimeType || "").trim(),
    status,
    submittedByPortal: actor.kind === "admin" ? "admin" : "user",
    createdAt: now,
    updatedAt: now,
  };

  if (actor.kind === "admin") {
    doc.organizerEmail = normalizeOrganizerEmail(actor.session.email);
    doc.organizerName = actor.session.name;
    doc.reviewedByEmail = normalizeOrganizerEmail(actor.session.email);
  } else if (actor.kind === "user") {
    doc.organizerId = actor.id;
    doc.organizerEmail = normalizeOrganizerEmail(actor.email);
    doc.organizerName = actor.name;
  } else {
    doc.organizerEmail = normalizeOrganizerEmail(actor.session.email);
    doc.organizerName = actor.session.name;
  }

  try {
    const db = await getAdminDb();
    const result = await eventsCollection(db).insertOne(doc);
    const event = sanitizeEvent({ ...doc, _id: result.insertedId });

    void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
      logUserActivity({
        type: "event_submitted",
        actorEmail: event.organizerEmail,
        actorName: event.organizerName,
        targetId: event.id,
        targetTitle: event.title,
        organization: event.category || "",
        meta: { status: event.status, portal: event.submittedByPortal },
      }),
    );
    if (event.status === "pending") {
      void import("@/lib/user-server/portal").then(({ notifyAdmins }) =>
        notifyAdmins({
          title: "New Event Submission",
          body: `${event.organizerName || event.organizerEmail} submitted ${event.title} for approval.`,
          type: "event-submitted",
          eventId: event.id,
          eventTitle: event.title,
        }),
      );
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create event.", details },
      { status: 500 },
    );
  }
}
