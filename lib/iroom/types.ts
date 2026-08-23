import type { IroomReservationStatus } from "@/lib/events/types";

export type { IroomReservationStatus };

/** Payload DC Space writes into IRoomReserve Firebase `reservations` collection. */
export type IroomReservationDoc = {
  reservationId: string;
  sourceSystem: "dcspace";
  dcSpaceEventId: string;
  eventTitle: string;
  eventDescription?: string;
  eventCategory?: string;
  eventStatus?: string;
  venueType?: string;
  locationLabel?: string;
  department?: string;
  collaboratingDepartments?: string[];
  startAt: string;
  endAt: string;
  purpose?: string;
  conceptPaperUrl?: string;
  conceptPaperName?: string;
  requestedByUserId?: string;
  requestedByEmail: string;
  requestedByName: string;
  organizationName?: string;
  organizationRole?: string;
  school?: string;
  course?: string;
  studentNumber?: string;
  roomId?: string;
  roomName?: string;
  building?: string;
  status: IroomReservationStatus;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
};

/** IRoomReserve webhook body when reservation status changes. */
export type IroomWebhookPayload = {
  reservationId: string;
  dcSpaceEventId: string;
  status: IroomReservationStatus;
  roomId?: string;
  roomName?: string;
  building?: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
};

export type IroomLinkedUserDoc = {
  dcSpaceUserId: string;
  email: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  studentNumber?: string;
  role?: string;
  organizationPart?: string;
  organizationRole?: string;
  school?: string;
  course?: string;
  rfidNumber?: string;
  sourceSystem: "dcspace";
  updatedAt: string;
};
