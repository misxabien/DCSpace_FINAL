import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { requireAdminPermission } from "@/lib/admin-server/admin-permissions";
import { getUserDb } from "@/lib/user-server/get-user-db";
import {
  applyReservationStatusToEvent,
  type ReservationStatusValue,
} from "@/lib/integrations/reservation-status";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const ALLOWED: ReservationStatusValue[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "completed",
];

/**
 * Admin override / repair for eRoomReserve sync.
 * Use when eRoom already approved but DC Space is still pending.
 *
 * POST body:
 * {
 *   "status": "approved",
 *   "reservationId"?: "...",
 *   "room"?: { "id"?: "...", "name"?: "...", "capacity"?: number }
 * }
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const denied = await requireAdminPermission(auth, "approve-events");
  if (denied) return denied;

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  let body: {
    status?: unknown;
    reservationId?: unknown;
    room?: {
      id?: unknown;
      name?: unknown;
      capacity?: unknown;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const status = String(body.status || "").trim() as ReservationStatusValue;
  if (!ALLOWED.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const userDb = await getUserDb();
    const saved = await applyReservationStatusToEvent(userDb, {
      eventId: id,
      status,
      reservationId:
        typeof body.reservationId === "string" ? body.reservationId : undefined,
      room: {
        id: typeof body.room?.id === "string" ? body.room.id : undefined,
        name: typeof body.room?.name === "string" ? body.room.name : undefined,
        capacity:
          typeof body.room?.capacity === "number" ? body.room.capacity : undefined,
      },
    });

    return NextResponse.json({ ok: true, reservation: saved });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    const statusCode = details === "Event not found." ? 404 : 500;
    return NextResponse.json(
      { error: "Failed to update reservation status.", details },
      { status: statusCode },
    );
  }
}
