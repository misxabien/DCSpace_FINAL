import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { sanitizeEvent, type SpaceEvent } from "@/lib/events/types";
import { getIroomConfig } from "@/lib/iroom/config";
import { applyIroomWebhook } from "@/lib/iroom/sync";
import type { IroomReservationStatus, IroomWebhookPayload } from "@/lib/iroom/types";

const VALID_STATUSES: IroomReservationStatus[] = [
  "none",
  "pending",
  "approved",
  "rejected",
  "cancelled",
];

/** IRoomReserve calls this when a reservation is approved, rejected, or cancelled. */
export async function POST(request: Request) {
  const config = getIroomConfig();
  if (config.webhookSecret) {
    const provided = request.headers.get("x-iroom-secret") || "";
    if (provided !== config.webhookSecret) {
      return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
    }
  }

  let body: Partial<IroomWebhookPayload>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const reservationId = String(body.reservationId || "").trim();
  const dcSpaceEventId = String(body.dcSpaceEventId || "").trim();
  const status = String(body.status || "").trim() as IroomReservationStatus;

  if (!reservationId || !dcSpaceEventId) {
    return NextResponse.json(
      { error: "reservationId and dcSpaceEventId are required." },
      { status: 400 },
    );
  }
  if (!VALID_STATUSES.includes(status) || status === "none") {
    return NextResponse.json({ error: "Invalid reservation status." }, { status: 400 });
  }

  try {
    const updated = await applyIroomWebhook({
      reservationId,
      dcSpaceEventId,
      status,
      roomId: String(body.roomId || "").trim() || undefined,
      roomName: String(body.roomName || "").trim() || undefined,
      building: String(body.building || "").trim() || undefined,
      rejectionReason: String(body.rejectionReason || "").trim() || undefined,
      approvedBy: String(body.approvedBy || "").trim() || undefined,
      approvedAt: String(body.approvedAt || "").trim() || undefined,
    });

    return NextResponse.json({
      ok: true,
      event: sanitizeEvent(updated as SpaceEvent & { _id: ObjectId }),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to apply reservation update.", details },
      { status: 500 },
    );
  }
}
