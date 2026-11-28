import { NextResponse } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { requireAdminPermission } from "@/lib/admin-server/admin-permissions";
import { findEventById } from "@/lib/events/find-event";
import { eventsCollection } from "@/lib/events/types";

type RouteContext = { params: Promise<{ id: string }> };

/** Records that belong to one event and go away with it (all keyed by eventId). */
const LINKED_COLLECTIONS = {
  registrations: ["event_registrations"],
  invitations: ["event_invitations"],
  attendance: ["attendance_records", "attendance_security_events"],
  feedback: ["feedback_entries"],
  certificates: ["certificates"],
  photos: ["event_gallery"],
  notifications: ["notifications"],
  reports: ["event_reports", "admin_reports"],
  roomSync: ["reservationStatuses"],
} as const;

type LinkedKey = keyof typeof LINKED_COLLECTIONS;
type LinkedCounts = Record<LinkedKey, number>;

function emptyCounts(): LinkedCounts {
  return {
    registrations: 0,
    invitations: 0,
    attendance: 0,
    feedback: 0,
    certificates: 0,
    photos: 0,
    notifications: 0,
    reports: 0,
    roomSync: 0,
  };
}

/** Event ids are stored as strings; also match an ObjectId copy just in case. */
function byEvent(id: string) {
  return { eventId: { $in: [id, new ObjectId(id)] } };
}

/** The user DB and admin DB, once each (they are the same DB on some setups). */
function distinctDbs(userDb: Db, adminDb: Db) {
  return userDb.databaseName === adminDb.databaseName ? [userDb] : [userDb, adminDb];
}

async function countLinked(dbs: Db[], id: string) {
  const counts = emptyCounts();
  const filter = byEvent(id);
  await Promise.all(
    dbs.flatMap((db) =>
      (Object.keys(LINKED_COLLECTIONS) as LinkedKey[]).flatMap((key) =>
        LINKED_COLLECTIONS[key].map(async (name) => {
          // Await first: "counts[key] += await …" would read the total before the
          // wait, and parallel counts (user DB + admin DB) would overwrite each other.
          const count = await db.collection(name).countDocuments(filter).catch(() => 0);
          counts[key] += count;
        }),
      ),
    ),
  );
  return counts;
}

async function authorize(request: Request, permission: "view-events" | "reject-events") {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  const denied = await requireAdminPermission(auth, permission);
  if (denied) {
    return { response: NextResponse.json({ error: denied.error }, { status: denied.status }) };
  }
  return { auth };
}

/** What deleting this event would remove — shown in the confirmation box first. */
export async function GET(request: Request, context: RouteContext) {
  const gate = await authorize(request, "view-events");
  if (gate.response) return gate.response;

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const { event, userDb, adminDb } = await findEventById(id);
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const counts = await countLinked(distinctDbs(userDb, adminDb), id);
    return NextResponse.json({
      event: { id, title: String(event.title || "Event"), status: String(event.status || "") },
      counts,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load event.", details }, { status: 500 });
  }
}

/**
 * Permanently delete an event and everything tied to it (registrations,
 * invitations, attendance, feedback, certificates, gallery photos, its
 * notifications and reports). Same permission as rejecting an event.
 * The client must send ?confirm=yes, set only after the admin confirms.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const gate = await authorize(request, "reject-events");
  if (gate.response) return gate.response;
  const { session } = gate.auth;

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }
  if (new URL(request.url).searchParams.get("confirm") !== "yes") {
    return NextResponse.json({ error: "Deleting an event must be confirmed." }, { status: 400 });
  }

  try {
    const { event, userDb, adminDb } = await findEventById(id);
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const dbs = distinctDbs(userDb, adminDb);
    const filter = byEvent(id);
    const deleted = emptyCounts();

    // Linked records first, the event last: if anything fails part-way the
    // event is still there and the admin can simply delete it again.
    await Promise.all(
      dbs.flatMap((db) => [
        ...(Object.keys(LINKED_COLLECTIONS) as LinkedKey[]).flatMap((key) =>
          LINKED_COLLECTIONS[key].map(async (name) => {
            const result = await db.collection(name).deleteMany(filter);
            deleted[key] += result.deletedCount;
          }),
        ),
        db
          .collection<{ eventIds: string[] }>("saved_events")
          .updateMany({ eventIds: id }, { $pull: { eventIds: id } }),
      ]),
    );
    await Promise.all(dbs.map((db) => eventsCollection(db).deleteOne({ _id: new ObjectId(id) })));

    // Free the room in iRoom the same way a cancellation does (best-effort).
    void import("@/lib/iroom/sync")
      .then(({ syncEventCancellationToIroom }) =>
        syncEventCancellationToIroom({ ...event, status: "cancelled" as const }),
      )
      .catch(() => {
        /* room release is best-effort */
      });

    void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
      logUserActivity({
        type: "event_deleted",
        actorEmail: session.email,
        actorName: session.name,
        actorRole: session.role,
        targetId: id,
        targetTitle: String(event.title || "Event"),
        meta: {
          status: event.status,
          organizerEmail: event.organizerEmail || "",
          startsAt: event.startsAt || "",
          deleted,
        },
      }),
    );

    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to delete event.", details }, { status: 500 });
  }
}
