import { ObjectId } from "mongodb";
import {
  eventsCollection,
  type IroomReservationStatus,
  type SpaceEvent,
} from "@/lib/events/types";
import { buildIroomOpenUrl, getIroomConfig } from "@/lib/iroom/config";
import {
  patchIroomReservationStatus,
  upsertIroomLinkedUser,
  upsertIroomReservation,
} from "@/lib/iroom/firestore";
import type { IroomReservationDoc, IroomWebhookPayload } from "@/lib/iroom/types";
import { getAdminDb } from "@/lib/db/get-db";

type ReservationActor = {
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

function reservationIdForEvent(eventId: string, existing?: string) {
  return existing || `dcspace-${eventId}`;
}

function conceptPaperUrl(eventId: string) {
  return `/api/events/${encodeURIComponent(eventId)}/attachments/concept-paper`;
}

export async function syncLinkedUser(actor: ReservationActor) {
  const now = new Date().toISOString();
  const [firstName = "", ...rest] = actor.name.trim().split(/\s+/);
  const linkedUser = {
    dcSpaceUserId: actor.userId || "",
    email: actor.email.toLowerCase(),
    fullName: actor.name,
    firstName,
    lastName: rest.join(" "),
    studentNumber: actor.studentNumber || "",
    role: actor.role || "",
    organizationPart: actor.organizationPart || "",
    organizationRole: actor.organizationRole || "",
    school: actor.school || "",
    course: actor.course || "",
    sourceSystem: "dcspace" as const,
    updatedAt: now,
  };

  const config = getIroomConfig();
  if (config.enabled) {
    await upsertIroomLinkedUser(linkedUser);
  }

  return linkedUser;
}

export async function createOrRefreshIroomReservation(input: {
  eventId: string;
  actor: ReservationActor;
}) {
  const db = await getAdminDb();
  const event = await eventsCollection(db).findOne({ _id: new ObjectId(input.eventId) });
  if (!event) {
    throw new Error("Event not found.");
  }

  const now = new Date().toISOString();
  const reservationId = reservationIdForEvent(input.eventId, event.iroomReservationId);
  const status: IroomReservationStatus =
    event.iroomStatus && event.iroomStatus !== "none" ? event.iroomStatus : "pending";

  await syncLinkedUser(input.actor);

  const reservation: IroomReservationDoc = {
    reservationId,
    sourceSystem: "dcspace",
    dcSpaceEventId: input.eventId,
    eventTitle: event.title,
    eventDescription: event.description || "",
    eventCategory: event.category || "",
    eventStatus: event.status,
    venueType: event.venueType || "",
    locationLabel: event.location || "",
    department: event.department || "",
    collaboratingDepartments: event.collaboratingDepartments || [],
    startAt: event.startsAt || "",
    endAt: event.endsAt || "",
    purpose: event.announcements || event.description || "",
    conceptPaperUrl: event.conceptPaperBase64 ? conceptPaperUrl(input.eventId) : "",
    conceptPaperName: event.conceptPaperName || "",
    requestedByUserId: input.actor.userId || event.organizerId || "",
    requestedByEmail: input.actor.email || event.organizerEmail || "",
    requestedByName: input.actor.name || event.organizerName || "",
    organizationName: input.actor.organizationPart || event.category || "",
    organizationRole: input.actor.organizationRole || "",
    school: input.actor.school || "",
    course: input.actor.course || "",
    studentNumber: input.actor.studentNumber || "",
    roomId: event.iroomRoomId || "",
    roomName: event.iroomRoomName || "",
    status,
    rejectionReason: event.iroomRejectionReason || "",
    createdAt: event.createdAt || now,
    updatedAt: now,
    lastSyncedAt: now,
  };

  const config = getIroomConfig();
  if (config.enabled) {
    await upsertIroomReservation(reservation);
  }

  await eventsCollection(db).updateOne(
    { _id: new ObjectId(input.eventId) },
    {
      $set: {
        iroomReservationId: reservationId,
        iroomStatus: status,
        iroomSyncedAt: now,
        updatedAt: now,
      },
    },
  );

  return {
    reservation,
    openUrl: buildIroomOpenUrl(config, reservationId, input.eventId),
    firebaseConfigured: config.enabled,
  };
}

export async function applyIroomWebhook(payload: IroomWebhookPayload) {
  if (!ObjectId.isValid(payload.dcSpaceEventId)) {
    throw new Error("Invalid dcSpaceEventId.");
  }

  const db = await getAdminDb();
  const now = new Date().toISOString();
  const update = {
    iroomReservationId: payload.reservationId,
    iroomStatus: payload.status,
    iroomRoomId: payload.roomId || "",
    iroomRoomName: payload.roomName || "",
    iroomRejectionReason: payload.rejectionReason || "",
    iroomSyncedAt: now,
    updatedAt: now,
  };

  const result = await eventsCollection(db).findOneAndUpdate(
    { _id: new ObjectId(payload.dcSpaceEventId) },
    { $set: update },
    { returnDocument: "after" },
  );

  if (!result) {
    throw new Error("Linked event not found.");
  }

  return result as SpaceEvent & { _id: ObjectId };
}

export async function syncEventCancellationToIroom(event: SpaceEvent & { _id?: ObjectId }) {
  if (!event.iroomReservationId || !event.iroomStatus || event.iroomStatus === "none") {
    return;
  }

  const now = new Date().toISOString();
  const config = getIroomConfig();
  if (config.enabled) {
    await patchIroomReservationStatus(event.iroomReservationId, {
      status: "cancelled",
      eventStatus: event.status,
      updatedAt: now,
      lastSyncedAt: now,
    });
  }

  if (!event._id) return;
  const db = await getAdminDb();
  await eventsCollection(db).updateOne(
    { _id: event._id },
    {
      $set: {
        iroomStatus: "cancelled",
        iroomSyncedAt: now,
        updatedAt: now,
      },
    },
  );
}
