import { NextResponse } from "next/server";
import { getUserDb } from "@/lib/user-server/get-user-db";
import {
  upsertReservationStatus,
  type ReservationStatusValue,
} from "@/lib/integrations/reservation-status";

export const runtime = "nodejs";

const ALLOWED_STATUSES: ReservationStatusValue[] = [
  "approved",
  "rejected",
  "cancelled",
  "completed",
];

/**
 * Inbound sync from eRoomReserve.
 * Authorization: Bearer <RESERVATION_STATUS_SYNC_SECRET>
 */
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const secret = process.env.RESERVATION_STATUS_SYNC_SECRET || "";

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    reservationId?: unknown;
    status?: unknown;
    room?: {
      id?: unknown;
      name?: unknown;
      capacity?: unknown;
    };
    updatedAt?: unknown;
    eventId?: unknown;
    dcSpaceEventId?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid reservation update payload" },
      { status: 400 },
    );
  }

  const isValid =
    typeof body.reservationId === "string" &&
    body.reservationId.trim().length > 0 &&
    typeof body.status === "string" &&
    ALLOWED_STATUSES.includes(body.status as ReservationStatusValue) &&
    typeof body.room?.id === "string" &&
    body.room.id.trim().length > 0 &&
    typeof body.room?.name === "string" &&
    body.room.name.trim().length > 0 &&
    typeof body.room?.capacity === "number" &&
    Number.isFinite(body.room.capacity) &&
    body.room.capacity >= 0 &&
    typeof body.updatedAt === "string";

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid reservation update payload" },
      { status: 400 },
    );
  }

  const eventIdRaw = body.eventId ?? body.dcSpaceEventId;
  const eventId =
    typeof eventIdRaw === "string" && eventIdRaw.trim() ? eventIdRaw.trim() : "";

  try {
    const db = await getUserDb();
    const saved = await upsertReservationStatus(db, {
      reservationId: body.reservationId as string,
      status: body.status as ReservationStatusValue,
      room: {
        id: body.room!.id as string,
        name: body.room!.name as string,
        capacity: body.room!.capacity as number,
      },
      updatedAt: body.updatedAt as string,
      eventId: eventId || undefined,
    });

    if (saved.status === "approved") {
      void import("@/lib/user-server/portal").then(({ notifyAdmins }) =>
        notifyAdmins({
          title: "eRoomReserve validated",
          body: `${saved.room.name} is approved for reservation ${saved.reservationId}. Pending event is ready for DC Space approval.`,
          type: "reservation-validated",
          eventId: saved.eventId || undefined,
          eventTitle: saved.room.name,
        }),
      );
    }

    return NextResponse.json({ ok: true, reservation: saved });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to store reservation update.", details },
      { status: 500 },
    );
  }
}
