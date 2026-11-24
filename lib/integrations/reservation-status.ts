import type { Db } from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";

export type ReservationRoom = {
  id: string;
  name: string;
  capacity: number;
};

export type ReservationStatusValue =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed";

export type ReservationStatusDoc = {
  reservationId: string;
  status: ReservationStatusValue;
  room: ReservationRoom;
  updatedAt: Date;
  eventId?: string;
  syncedAt: Date;
};

export function reservationStatusesCollection(db: Db) {
  return db.collection<ReservationStatusDoc>("reservationStatuses");
}

/** Map eRoomReserve status → admin validation label. */
export function reservationUiLabel(status?: string | null) {
  if (status === "approved") return "Validated";
  if (status === "rejected") return "Rejected";
  if (status === "cancelled") return "Cancelled";
  if (status === "completed") return "Completed";
  if (status === "pending") return "Pending eRoomReserve";
  if (status) return status.replace(/^\w/, (c) => c.toUpperCase());
  return "Pending";
}

/** Room is ready for DC Space final event approval. */
export function isRoomValidatedForEventApproval(status?: string | null) {
  return status === "approved" || status === "completed";
}

/** Provisional ids created by DC Space look like `dcspace-<mongoEventId>`. */
export function eventIdFromProvisionalReservationId(reservationId: string) {
  const match = String(reservationId || "")
    .trim()
    .match(/^dcspace-([a-f\d]{24})$/i);
  return match?.[1] || "";
}

export async function upsertReservationStatus(
  db: Db,
  input: {
    reservationId: string;
    status: ReservationStatusValue;
    room: ReservationRoom;
    updatedAt: string;
    eventId?: string;
  },
) {
  const reservationId = input.reservationId.trim();
  let eventId = String(input.eventId || "").trim();
  if (!eventId) {
    eventId = eventIdFromProvisionalReservationId(reservationId);
  }

  const syncedAt = new Date();
  const updatedAt = new Date(input.updatedAt);
  const room = {
    id: input.room.id.trim(),
    name: input.room.name.trim(),
    capacity: input.room.capacity,
  };

  const linkedEventId = await linkReservationToEvents(db, {
    reservationId,
    status: input.status,
    room,
    eventId: eventId || undefined,
    updatedAtHint: Number.isNaN(updatedAt.getTime()) ? syncedAt : updatedAt,
  });

  const resolvedEventId = linkedEventId || eventId;
  const $set: Partial<ReservationStatusDoc> = {
    reservationId,
    status: input.status,
    room,
    updatedAt: Number.isNaN(updatedAt.getTime()) ? syncedAt : updatedAt,
    syncedAt,
  };
  if (resolvedEventId) $set.eventId = resolvedEventId;

  await reservationStatusesCollection(db).updateOne(
    { reservationId },
    { $set },
    { upsert: true },
  );

  // Keep provisional dcspace-<eventId> rows in sync when eRoom uses a different id.
  if (
    resolvedEventId &&
    reservationId !== `dcspace-${resolvedEventId}` &&
    MongoObjectId.isValid(resolvedEventId)
  ) {
    await reservationStatusesCollection(db).updateOne(
      { reservationId: `dcspace-${resolvedEventId}` },
      {
        $set: {
          reservationId: `dcspace-${resolvedEventId}`,
          status: input.status,
          room,
          updatedAt: Number.isNaN(updatedAt.getTime()) ? syncedAt : updatedAt,
          syncedAt,
          eventId: resolvedEventId,
        },
      },
      { upsert: true },
    );
  }

  return {
    reservationId,
    status: input.status,
    room,
    eventId: resolvedEventId || "",
  };
}

async function linkReservationToEvents(
  statusDb: Db,
  input: {
    reservationId: string;
    status: ReservationStatusValue;
    room: ReservationRoom;
    eventId?: string;
    updatedAtHint?: Date;
  },
): Promise<string> {
  // Events live in the admin DB; reservationStatuses stay in the user DB.
  const { getAdminDb } = await import("@/lib/db/get-db");
  const adminDb = await getAdminDb();
  const events = eventsCollection(adminDb);
  const now = new Date().toISOString();
  const iroomStatus =
    input.status === "completed" || input.status === "approved"
      ? "approved"
      : input.status === "rejected"
        ? "rejected"
        : input.status === "cancelled"
          ? "cancelled"
          : "pending";
  const patch: Record<string, unknown> = {
    reservationId: input.reservationId,
    reservationStatus: input.status,
    reservationRoomId: input.room.id,
    reservationRoomName: input.room.name,
    reservationCapacity: input.room.capacity,
    iroomReservationId: input.reservationId,
    iroomStatus,
    iroomRoomId: input.room.id,
    iroomRoomName: input.room.name,
    // Keep organizer-typed venue when eRoom uses a different catalog name.
    updatedAt: now,
    iroomSyncedAt: now,
  };
  if (input.room.name) {
    patch.reservationRoomName = input.room.name;
  }

  let eventId = String(input.eventId || "").trim();
  if (!eventId) {
    eventId = eventIdFromProvisionalReservationId(input.reservationId);
  }

  if (eventId && MongoObjectId.isValid(eventId)) {
    const result = await events.updateOne(
      { _id: new MongoObjectId(eventId) },
      { $set: patch },
    );
    // If the event exists, also fill location only when empty (or the "TBA" placeholder).
    if (result.matchedCount > 0 && input.room.name) {
      await events.updateOne(
        {
          _id: new MongoObjectId(eventId),
          $or: [
            { location: { $exists: false } },
            { location: "" },
            { location: "TBA" },
            { location: { $type: "null" } },
          ],
        },
        { $set: { location: input.room.name } },
      );
      return eventId;
    }
    if (result.matchedCount > 0) {
      return eventId;
    }
  }

  // Prefer events already tagged with this reservation.
  const byReservation = await events.findOneAndUpdate(
    {
      $or: [
        { reservationId: input.reservationId },
        { iroomReservationId: input.reservationId },
      ],
    },
    { $set: patch },
    { sort: { updatedAt: -1 }, returnDocument: "after" },
  );
  if (byReservation?._id) {
    return String(byReservation._id);
  }

  // eRoom often returns a different reservationId and omits dcSpaceEventId.
  // Recover by attaching to the nearest pending on-campus event that still
  // carries a provisional dcspace-<id> reservation and is close in time.
  if (input.status === "approved" || input.status === "completed") {
    const hint = input.updatedAtHint?.getTime() || Date.now();
    const windowMs = 6 * 60 * 60 * 1000;
    const candidates = await events
      .find({
        status: "pending",
        $or: [
          { reservationStatus: { $in: ["pending", ""] } },
          { reservationStatus: { $exists: false } },
          { reservationStatus: { $type: "null" } },
        ],
        reservationId: { $regex: /^dcspace-[a-f\d]{24}$/i },
      })
      .project({
        _id: 1,
        updatedAt: 1,
        createdAt: 1,
        location: 1,
        reservationRoomName: 1,
        reservationId: 1,
      })
      .sort({ updatedAt: -1 })
      .limit(20)
      .toArray();

    let best: { id: string; score: number } | null = null;
    for (const candidate of candidates) {
      const stamp = Date.parse(
        String(candidate.updatedAt || candidate.createdAt || ""),
      );
      if (!Number.isFinite(stamp)) continue;
      const delta = Math.abs(stamp - hint);
      if (delta > windowMs) continue;
      const roomHint = normalizeRoomLabel(input.room.name);
      const eventRoom = normalizeRoomLabel(
        String(candidate.reservationRoomName || candidate.location || ""),
      );
      const roomBonus =
        roomHint && eventRoom && (roomHint.includes(eventRoom) || eventRoom.includes(roomHint))
          ? 0
          : roomTokensOverlap(roomHint, eventRoom)
            ? 30 * 60 * 1000
            : 2 * 60 * 60 * 1000;
      const score = delta + roomBonus;
      if (!best || score < best.score) {
        best = { id: String(candidate._id), score };
      }
    }

    if (best) {
      await events.updateOne({ _id: new MongoObjectId(best.id) }, { $set: patch });
      if (input.room.name) {
        await events.updateOne(
          {
            _id: new MongoObjectId(best.id),
            $or: [
              { location: { $exists: false } },
              { location: "" },
              { location: "TBA" },
              { location: { $type: "null" } },
            ],
          },
          { $set: { location: input.room.name } },
        );
      }
      return best.id;
    }
  }

  console.warn(
    `[DC Space] Reservation ${input.reservationId} has no linked DC Space event yet.`,
  );
  return "";
}

function normalizeRoomLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function roomTokensOverlap(a: string, b: string) {
  if (!a || !b) return false;
  const skip = new Set(["room", "hall", "studio", "campus", "digital", "the", "and"]);
  const tokensA = a.split(" ").filter((t) => t.length > 2 && !skip.has(t));
  const tokensB = new Set(b.split(" ").filter((t) => t.length > 2 && !skip.has(t)));
  return tokensA.some((t) => tokensB.has(t));
}

export async function findReservationForEvent(
  db: Db,
  event: {
    id?: string;
    reservationId?: string;
    location?: string;
  },
) {
  const col = reservationStatusesCollection(db);
  if (event.reservationId) {
    const byId = await col.findOne({ reservationId: event.reservationId });
    if (byId) return byId;
    const provisional = eventIdFromProvisionalReservationId(event.reservationId);
    if (provisional) {
      const byProvisionalEvent = await col.findOne(
        { eventId: provisional },
        { sort: { syncedAt: -1 } },
      );
      if (byProvisionalEvent) return byProvisionalEvent;
    }
  }
  if (event.id) {
    const byEvent = await col.findOne(
      { eventId: event.id },
      { sort: { syncedAt: -1 } },
    );
    if (byEvent) return byEvent;
    const provisionalId = `dcspace-${event.id}`;
    const byProvisional = await col.findOne({ reservationId: provisionalId });
    if (byProvisional) return byProvisional;
  }
  return null;
}

/** Admin/manual apply of an eRoomReserve status onto a specific DC Space event. */
export async function applyReservationStatusToEvent(
  userDb: Db,
  input: {
    eventId: string;
    reservationId?: string;
    status: ReservationStatusValue;
    room?: Partial<ReservationRoom>;
    updatedAt?: string;
  },
) {
  const { getAdminDb } = await import("@/lib/db/get-db");
  const adminDb = await getAdminDb();
  if (!MongoObjectId.isValid(input.eventId)) {
    throw new Error("Invalid event id.");
  }
  const event = await eventsCollection(adminDb).findOne({
    _id: new MongoObjectId(input.eventId),
  });
  if (!event) throw new Error("Event not found.");

  const reservationId =
    String(input.reservationId || event.reservationId || event.iroomReservationId || "").trim() ||
    `dcspace-${input.eventId}`;
  const room: ReservationRoom = {
    id: String(input.room?.id || event.reservationRoomId || event.iroomRoomId || "manual").trim(),
    name: String(
      input.room?.name ||
        event.reservationRoomName ||
        event.iroomRoomName ||
        event.location ||
        "On Campus",
    ).trim(),
    capacity: Number(input.room?.capacity ?? event.reservationCapacity ?? 0),
  };

  return upsertReservationStatus(userDb, {
    reservationId,
    status: input.status,
    room,
    updatedAt: input.updatedAt || new Date().toISOString(),
    eventId: input.eventId,
  });
}
