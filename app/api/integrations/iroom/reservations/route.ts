import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { ensureRoomReservationForEvent } from "@/lib/integrations/ensure-room-reservation";
import { getAdminDb } from "@/lib/db/get-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";

/** Create or refresh an eRoomReserve reservation for a DC Space event. */
export async function POST(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body: { eventId?: string; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!ObjectId.isValid(eventId)) {
    return NextResponse.json({ error: "Valid eventId is required." }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const event = await eventsCollection(db).findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const owns =
      event.organizerEmail === actor.email ||
      event.organizerId === actor.userId ||
      actor.role === "admin" ||
      actor.role === "super-admin";
    if (!owns) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (event.venueType !== "On Campus") {
      return NextResponse.json(
        { error: "Room reservation is only required for on-campus events." },
        { status: 400 },
      );
    }

    const result = await ensureRoomReservationForEvent({
      eventId,
      force: Boolean(body.force),
      actor: {
        userId: actor.userId,
        email: actor.email,
        name: actor.name,
        studentNumber: actor.studentNumber,
        role: actor.role,
        organizationPart: actor.organizationPart,
        organizationRole: actor.organizationRole,
        school: actor.school,
        course: actor.course,
      },
    });

    if (!result) {
      return NextResponse.json(
        { error: "Could not create room reservation for this event." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      reservationId: result.reservationId,
      status: result.reservationStatus,
      openUrl: result.openUrl,
      pushedToEroomReserve: result.pushedToEroomReserve,
      firebaseSynced: result.firebaseSynced,
      warning: result.warning || null,
      eventId,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create room reservation.", details },
      { status: 500 },
    );
  }
}

/** Read the linked eRoomReserve / iRoom reservation status for an event. */
export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { searchParams } = new URL(request.url);
  const eventId = String(searchParams.get("eventId") || "").trim();
  if (!ObjectId.isValid(eventId)) {
    return NextResponse.json({ error: "Valid eventId is required." }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const event = await eventsCollection(db).findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const visible =
      event.organizerEmail === actor.email ||
      event.organizerId === actor.userId ||
      actor.role === "admin" ||
      actor.role === "super-admin";
    if (!visible) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json({
      eventId,
      reservationId: event.reservationId || event.iroomReservationId || "",
      status: event.reservationStatus || event.iroomStatus || "none",
      roomId: event.reservationRoomId || event.iroomRoomId || "",
      roomName: event.reservationRoomName || event.iroomRoomName || "",
      rejectionReason: event.iroomRejectionReason || "",
      syncedAt: event.iroomSyncedAt || "",
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load room reservation.", details },
      { status: 500 },
    );
  }
}
