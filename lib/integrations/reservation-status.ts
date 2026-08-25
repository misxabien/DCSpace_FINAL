import type { Db, ObjectId } from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";

export type ReservationRoom = {
  id: string;
  name: string;
  capacity: number;
};

export type ReservationStatusValue =
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
  if (status) return status.replace(/^\w/, (c) => c.toUpperCase());
  return "Pending";
}

/** Room is ready for DC Space final event approval. */
export function isRoomValidatedForEventApproval(status?: string | null) {
  return status === "approved" || status === "completed";
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
  const eventId = String(input.eventId || "").trim();
  const syncedAt = new Date();
  const updatedAt = new Date(input.updatedAt);
  const room = {
    id: input.room.id.trim(),
    name: input.room.name.trim(),
    capacity: input.room.capacity,
  };

  const $set: Partial<ReservationStatusDoc> = {
    reservationId,
    status: input.status,
    room,
    updatedAt: Number.isNaN(updatedAt.getTime()) ? syncedAt : updatedAt,
    syncedAt,
  };
  if (eventId) $set.eventId = eventId;

  await reservationStatusesCollection(db).updateOne(
    { reservationId },
    { $set },
    { upsert: true },
  );

  await linkReservationToEvents(db, {
    reservationId,
    status: input.status,
    room,
    eventId: eventId || undefined,
  });

  return { reservationId, status: input.status, room, eventId: eventId || "" };
}

async function linkReservationToEvents(
  db: Db,
  input: {
    reservationId: string;
    status: ReservationStatusValue;
    room: ReservationRoom;
    eventId?: string;
  },
) {
  const events = eventsCollection(db);
  const patch = {
    reservationId: input.reservationId,
    reservationStatus: input.status,
    reservationRoomId: input.room.id,
    reservationRoomName: input.room.name,
    reservationCapacity: input.room.capacity,
    location: input.room.name,
    updatedAt: new Date().toISOString(),
  };

  if (input.eventId && MongoObjectId.isValid(input.eventId)) {
    await events.updateOne({ _id: new MongoObjectId(input.eventId) }, { $set: patch });
    return;
  }

  // Prefer events already tagged with this reservation.
  const byReservation = await events.updateMany(
    { reservationId: input.reservationId },
    { $set: patch },
  );
  if (byReservation.matchedCount > 0) return;

  // Fallback: attach to a pending event whose venue matches the reserved room.
  const pending = await events.findOne(
    {
      status: "pending",
      $or: [
        { location: input.room.name },
        { reservationRoomName: input.room.name },
        { reservationRoomId: input.room.id },
      ],
    },
    { sort: { updatedAt: -1 } },
  );
  if (pending?._id) {
    await events.updateOne({ _id: pending._id as ObjectId }, { $set: patch });
    await reservationStatusesCollection(db).updateOne(
      { reservationId: input.reservationId },
      { $set: { eventId: String(pending._id) } },
    );
  }
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
  }
  if (event.id) {
    const byEvent = await col.findOne(
      { eventId: event.id },
      { sort: { syncedAt: -1 } },
    );
    if (byEvent) return byEvent;
  }
  if (event.location) {
    return col.findOne(
      { "room.name": event.location },
      { sort: { syncedAt: -1 } },
    );
  }
  return null;
}
