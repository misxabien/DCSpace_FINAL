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
import { findOrganizerEvents } from "@/lib/events/find-event";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { organizerOwnershipFilter } from "@/lib/events/ownership";
import { parseDurationToMinutes } from "@/lib/certificates/template";
import { requireUserAuth } from "@/lib/user-server/require-user-auth";

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
    return {
      kind: session.isAdmin ? ("admin" as const) : ("session" as const),
      session,
    };
  }

  return null;
}

/** Shared events list — admins see all; organizers see their own + approved. */
export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit") || 100) || 100, 500);

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (searchParams.get("hasCertificateTemplate") === "1") {
      filter.certificateTemplateBase64 = { $exists: true, $nin: [null, ""] };
    }

    if (actor.kind === "user") {
      filter.$or = [
        { organizerId: actor.id },
        { organizerEmail: actor.email },
        { status: { $in: ["approved", "live", "completed"] } },
      ];
    } else if (actor.kind === "session" && !actor.session.isAdmin) {
      filter.$or = [
        { organizerEmail: actor.session.email },
        { status: { $in: ["approved", "live", "completed"] } },
      ];
    }

    const adminDb = await getAdminDb();
    const userDb = await getUserDb();

    let docs: Array<SpaceEvent & { _id: ObjectId }>;
    if (actor.kind === "user" || (actor.kind === "session" && !actor.session.isAdmin)) {
      const email = actor.kind === "user" ? actor.email : actor.session.email;
      const userId = actor.kind === "user" ? actor.id : undefined;
      const owned = await findOrganizerEvents(organizerOwnershipFilter(email, userId), limit);
      const publicFilter: Record<string, unknown> = {
        status: { $in: ["approved", "live", "completed"] },
      };
      if (status) publicFilter.status = status;
      if (searchParams.get("hasCertificateTemplate") === "1") {
        publicFilter.certificateTemplateBase64 = { $exists: true, $nin: [null, ""] };
      }
      const [adminPublic, userPublic] = await Promise.all([
        eventsCollection(adminDb).find(publicFilter).sort({ updatedAt: -1 }).limit(limit).toArray(),
        eventsCollection(userDb).find(publicFilter).sort({ updatedAt: -1 }).limit(limit).toArray(),
      ]);
      const byId = new Map<string, SpaceEvent & { _id: ObjectId }>();
      for (const doc of [...userPublic, ...adminPublic, ...owned]) {
        byId.set(String(doc._id), doc as SpaceEvent & { _id: ObjectId });
      }
      docs = [...byId.values()]
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
        .slice(0, limit);
    } else {
      const docsAdmin = await eventsCollection(adminDb)
        .find(filter)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();
      const docsUser = await eventsCollection(userDb)
        .find(filter)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();
      const byId = new Map<string, SpaceEvent & { _id: ObjectId }>();
      for (const doc of [...docsUser, ...docsAdmin]) {
        byId.set(String(doc._id), doc as SpaceEvent & { _id: ObjectId });
      }
      docs = [...byId.values()]
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
        .slice(0, limit);
    }

    return NextResponse.json({
      events: docs.map((doc) => sanitizeEvent(doc as SpaceEvent & { _id: ObjectId })),
    });
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
    reservationId?: string;
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
    reservationId: String(body.reservationId || "").trim() || undefined,
    submittedByPortal: actor.kind === "admin" ? "admin" : "user",
    createdAt: now,
    updatedAt: now,
  };

  if (actor.kind === "admin") {
    doc.organizerEmail = actor.session.email;
    doc.organizerName = actor.session.name;
    doc.reviewedByEmail = actor.session.email;
  } else if (actor.kind === "user") {
    doc.organizerId = actor.id;
    doc.organizerEmail = actor.email;
    doc.organizerName = actor.name;
  } else {
    doc.organizerEmail = actor.session.email;
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
