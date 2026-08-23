import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  eventsCollection,
  sanitizeEvent,
  asStringList,
  type EventStatus,
  type SpaceEvent,
} from "@/lib/events/types";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";

const REVIEW_STATUSES: EventStatus[] = [
  "pending",
  "approved",
  "rejected",
  "postponed",
  "live",
  "completed",
  "cancelled",
];

type RouteContext = { params: Promise<{ id: string }> };

/** Fetch one event for student/organizer detail pages. */
export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const doc = await eventsCollection(db).findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    if (!isAdmin && actor && !("error" in actor)) {
      const visible =
        ["approved", "live", "completed"].includes(doc.status) ||
        doc.organizerEmail === actor.email ||
        doc.organizerId === actor.userId;
      if (!visible) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    return NextResponse.json({
      event: sanitizeEvent(doc as SpaceEvent & { _id: ObjectId }, { includeMedia: true }),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load event.", details },
      { status: 500 },
    );
  }
}

/** Admin reviews events; organizers can edit their own pending/rejected drafts. */
export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  let body: {
    status?: EventStatus;
    reviewNote?: string;
    title?: string;
    description?: string;
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
    category?: string;
    posterImageBase64?: string;
    posterImageMimeType?: string;
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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const existing = await eventsCollection(db).findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    if (!isAdmin) {
      const owns =
        existing.organizerEmail === (actor && !("error" in actor) ? actor.email : "") ||
        existing.organizerId === (actor && !("error" in actor) ? actor.userId : "");
      if (!owns) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (!["draft", "pending", "rejected"].includes(existing.status)) {
        return NextResponse.json(
          { error: "Only pending or rejected events can be edited." },
          { status: 409 },
        );
      }
    }

    const update: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (isAdmin && !("error" in admin)) {
      update.reviewedByEmail = admin.session.email;
    }

    if (body.status) {
      if (isAdmin) {
        if (!REVIEW_STATUSES.includes(body.status)) {
          return NextResponse.json({ error: "Invalid status." }, { status: 400 });
        }
        update.status = body.status;
      } else if (body.status === "pending" || body.status === "draft") {
        update.status = body.status;
      } else {
        return NextResponse.json({ error: "Organizers cannot set that status." }, { status: 403 });
      }
    }
    if (typeof body.reviewNote === "string" && isAdmin) {
      update.reviewNote = body.reviewNote.trim();
    }
    if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
    if (typeof body.description === "string") update.description = body.description.trim();
    if (typeof body.location === "string") update.location = body.location.trim();
    if (typeof body.startsAt === "string") update.startsAt = body.startsAt.trim();
    if (typeof body.endsAt === "string") update.endsAt = body.endsAt.trim();
    if (typeof body.attendanceRequired === "string") {
      update.attendanceRequired = body.attendanceRequired.trim();
    }
    if (typeof body.gracePeriod === "string") update.gracePeriod = body.gracePeriod.trim();
    if (typeof body.venueType === "string") update.venueType = body.venueType.trim();
    if (typeof body.announcements === "string") update.announcements = body.announcements.trim();
    if (typeof body.department === "string") update.department = body.department.trim();
    if (typeof body.category === "string") update.category = body.category.trim();
    if (Array.isArray(body.allowedCourses)) {
      update.allowedCourses = asStringList(body.allowedCourses);
    }
    if (Array.isArray(body.requiredFiles)) {
      update.requiredFiles = asStringList(body.requiredFiles);
    }
    if (Array.isArray(body.speakers)) update.speakers = asStringList(body.speakers);
    if (Array.isArray(body.collaboratingDepartments)) {
      update.collaboratingDepartments = asStringList(body.collaboratingDepartments);
    }
    if (Array.isArray(body.audienceSchools)) {
      update.audienceSchools = asStringList(body.audienceSchools);
    }
    if (Array.isArray(body.programActivities)) {
      update.programActivities = asStringList(body.programActivities);
    }
    if (typeof body.posterImageBase64 === "string") {
      update.posterImageBase64 = body.posterImageBase64.trim();
    }
    if (typeof body.posterImageMimeType === "string") {
      update.posterImageMimeType = body.posterImageMimeType.trim();
    }
    if (typeof body.certificateTemplateName === "string") {
      update.certificateTemplateName = body.certificateTemplateName.trim();
    }
    if (typeof body.certificateTemplateMimeType === "string") {
      update.certificateTemplateMimeType = body.certificateTemplateMimeType.trim();
    }
    if (typeof body.certificateTemplateBase64 === "string") {
      update.certificateTemplateBase64 = body.certificateTemplateBase64.trim();
    }
    if (typeof body.conceptPaperName === "string") {
      update.conceptPaperName = body.conceptPaperName.trim();
    }
    if (typeof body.conceptPaperMimeType === "string") {
      update.conceptPaperMimeType = body.conceptPaperMimeType.trim();
    }
    if (typeof body.conceptPaperBase64 === "string") {
      update.conceptPaperBase64 = body.conceptPaperBase64.trim();
    }
    if (typeof body.programFileName === "string") {
      update.programFileName = body.programFileName.trim();
    }
    if (typeof body.programFileMimeType === "string") {
      update.programFileMimeType = body.programFileMimeType.trim();
    }
    if (typeof body.programFileBase64 === "string") {
      update.programFileBase64 = body.programFileBase64.trim();
    }
    if (body.programFileVisibility === "organizers" || body.programFileVisibility === "everyone") {
      update.programFileVisibility = body.programFileVisibility;
    }

    const result = await eventsCollection(db).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" },
    );

    if (!result) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const event = sanitizeEvent(result as SpaceEvent & { _id: ObjectId }, { includeMedia: true });
    const actorEmail = isAdmin && !("error" in admin) ? admin.session.email : actor && !("error" in actor) ? actor.email : "";
    const actorName = isAdmin && !("error" in admin) ? admin.session.name : actor && !("error" in actor) ? actor.name : "";
    const actorRole = isAdmin && !("error" in admin) ? admin.session.role : actor && !("error" in actor) ? actor.role : "";

    if (body.status && isAdmin) {
      const type =
        body.status === "approved"
          ? "event_approved"
          : body.status === "rejected"
            ? "event_rejected"
            : body.status === "live"
              ? "event_live"
              : body.status === "completed"
                ? "event_completed"
                : body.status === "postponed"
                  ? "event_postponed"
                  : null;
      if (type) {
        void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
          logUserActivity({
            type,
            actorEmail,
            actorName,
            actorRole,
            targetId: event.id,
            targetTitle: event.title,
            meta: { status: body.status, reviewNote: body.reviewNote || "" },
          }),
        );
        if (event.organizerEmail) {
          void import("@/lib/user-server/portal").then(({ notifyUser }) =>
            notifyUser({
              email: event.organizerEmail,
              title:
                body.status === "approved"
                  ? "Event approved"
                  : body.status === "rejected"
                    ? "Event rejected"
                    : `Event ${body.status}`,
              body: `${event.title} is now ${body.status}.`,
              type: "event-status",
              eventId: event.id,
              eventTitle: event.title,
            }),
          );
        }
      }

      // Feature #8: auto-generate PDF report when event is marked completed.
      // Failures are logged only — status update already succeeded.
      if (body.status === "completed") {
        void import("@/lib/admin/event-report")
          .then(({ generateAndStoreEventReport }) =>
            generateAndStoreEventReport({
              eventId: event.id,
              generatedByEmail: actorEmail,
              trigger: "status_completed",
              db,
            }),
          )
          .catch((error) => {
            const details = error instanceof Error ? error.message : "Unknown error";
            console.error("[DC Space] Auto event report failed:", details);
          });
      }
    }

    return NextResponse.json({ event });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update event.", details },
      { status: 500 },
    );
  }
}
