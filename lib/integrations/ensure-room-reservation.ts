import { ObjectId } from "mongodb";
import { eventsCollection, type SpaceEvent } from "@/lib/events/types";
import { getAdminDb } from "@/lib/db/get-db";
import { getUserDb } from "@/lib/user-server/get-user-db";
import {
  createEroomReserveReservation,
  buildEroomReserveOpenUrl,
} from "@/lib/integrations/eroomreserve-client";
import { createOrRefreshIroomReservation } from "@/lib/iroom/sync";
import {
  upsertReservationStatus,
  type ReservationStatusValue,
} from "@/lib/integrations/reservation-status";

type Actor = {
  userId?: string;
  email: string;
  name: string;
  studentNumber?: string;
  role?: string;
  organizationPart?: string;
  organizationRole?: string;
  school?: string;
  course?: string;
};

export type EnsureRoomReservationResult = {
  reservationId: string;
  reservationStatus: string;
  openUrl: string;
  pushedToEroomReserve: boolean;
  firebaseSynced: boolean;
  warning?: string;
};

function isOnCampus(venueType?: string) {
  return String(venueType || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .includes("on campus");
}

function asTerminalOrPending(status: string): ReservationStatusValue {
  if (
    status === "approved" ||
    status === "rejected" ||
    status === "cancelled" ||
    status === "completed"
  ) {
    return status;
  }
  return "pending";
}

/**
 * After an on-campus event is created/updated, push a reservation to eRoomReserve
 * (HTTP + optional Firebase) and stamp the event so inbound webhooks can link by
 * reservationId / eventId.
 */
export async function ensureRoomReservationForEvent(input: {
  eventId: string;
  actor: Actor;
  force?: boolean;
}): Promise<EnsureRoomReservationResult | null> {
  if (!ObjectId.isValid(input.eventId)) return null;

  const adminDb = await getAdminDb();
  const event = await eventsCollection(adminDb).findOne({
    _id: new ObjectId(input.eventId),
  });
  if (!event) return null;
  if (!isOnCampus(event.venueType)) return null;

  const existingId = String(event.reservationId || event.iroomReservationId || "");
  const existingStatus = String(event.reservationStatus || event.iroomStatus || "");
  const validated =
    existingStatus === "approved" ||
    existingStatus === "completed" ||
    existingStatus === "rejected" ||
    existingStatus === "cancelled";

  if (existingId && validated && !input.force) {
    return {
      reservationId: existingId,
      reservationStatus: existingStatus,
      openUrl: buildEroomReserveOpenUrl({
        eventId: input.eventId,
        reservationId: existingId,
      }),
      pushedToEroomReserve: false,
      firebaseSynced: false,
    };
  }

  const http = await createEroomReserveReservation({
    dcSpaceEventId: input.eventId,
    eventTitle: String(event.title || "Event"),
    startAt: String(event.startsAt || ""),
    endAt: String(event.endsAt || ""),
    requestedByEmail: input.actor.email || String(event.organizerEmail || ""),
    requestedByName: input.actor.name || String(event.organizerName || ""),
    locationLabel: String(event.location || "On Campus"),
    purpose: String(event.announcements || event.description || ""),
    department: String(event.department || ""),
    venueType: String(event.venueType || "On Campus"),
  });

  let firebaseSynced = false;
  let firebaseWarning = "";
  try {
    const firebase = await createOrRefreshIroomReservation({
      eventId: input.eventId,
      actor: input.actor,
    });
    firebaseSynced = Boolean(firebase.firebaseConfigured);
  } catch (error) {
    firebaseWarning =
      error instanceof Error ? error.message : "Firebase sync failed.";
  }

  const reservationId =
    http.reservationId || existingId || `dcspace-${input.eventId}`;
  const reservationStatus = asTerminalOrPending(String(http.status || "pending"));
  const now = new Date().toISOString();

  await eventsCollection(adminDb).updateOne(
    { _id: new ObjectId(input.eventId) },
    {
      $set: {
        reservationId,
        reservationStatus,
        iroomReservationId: reservationId,
        iroomStatus:
          reservationStatus === "approved" || reservationStatus === "completed"
            ? "approved"
            : reservationStatus === "rejected"
              ? "rejected"
              : reservationStatus === "cancelled"
                ? "cancelled"
                : "pending",
        iroomSyncedAt: now,
        updatedAt: now,
      },
    },
  );

  try {
    const userDb = await getUserDb();
    await upsertReservationStatus(userDb, {
      reservationId,
      status: reservationStatus,
      room: {
        id: String(event.reservationRoomId || "pending"),
        name: String(event.location || "On Campus"),
        capacity: Number(event.reservationCapacity || 0),
      },
      updatedAt: now,
      eventId: input.eventId,
    });
  } catch {
    /* non-blocking */
  }

  const warning = [!http.ok ? http.error : "", firebaseWarning]
    .filter(Boolean)
    .join(" · ");

  return {
    reservationId,
    reservationStatus,
    openUrl:
      http.openUrl ||
      buildEroomReserveOpenUrl({ eventId: input.eventId, reservationId }),
    pushedToEroomReserve: http.ok,
    firebaseSynced,
    warning: warning || undefined,
  };
}

export function eventNeedsRoomReservation(event: Pick<SpaceEvent, "venueType">) {
  return isOnCampus(event.venueType);
}
