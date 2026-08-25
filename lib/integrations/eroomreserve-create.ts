/**
 * DC Space → eRoomReserve outbound reservation API.
 * @see DC-Space-to-e-RoomReserve-Reservation-API.txt
 */

export type EroomReserveCreateInput = {
  dcSpaceEventId: string;
  eventTitle: string;
  startAt: string;
  endAt: string;
  requestedByEmail: string;
  locationLabel: string;
  advisorEmail?: string;
};

export type EroomReserveCreateResult =
  | { ok: true; reservationId: string; dcSpaceEventId: string; reused?: boolean }
  | { ok: false; status: number; error: string; details?: string };

const MANILA_TZ = "Asia/Manila";

export function isOnCampusVenue(venueType?: string | null) {
  const value = String(venueType || "").trim().toLowerCase();
  return value === "on campus" || value === "on-campus" || value === "oncampus";
}

/** Normalize YYYY-MM-DD + HH:mm into ISO-8601 with +08:00 offset. */
export function toManilaIsoTimestamp(datePart: string, timePart?: string) {
  const date = String(datePart || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Event date must use YYYY-MM-DD.");
  }
  const rawTime = String(timePart || "00:00").trim();
  const match = rawTime.match(/^(\d{1,2}):(\d{2})/);
  const hours = match ? Number(match[1]) : 0;
  const minutes = match ? Number(match[2]) : 0;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return `${date}T${hh}:${mm}:00+08:00`;
}

/** Parse stored startsAt/endsAt into ISO with Manila offset when possible. */
export function normalizeEventTimestamp(raw: string, fallbackDate?: string) {
  const value = String(raw || "").trim();
  if (!value) {
    if (fallbackDate) return toManilaIsoTimestamp(fallbackDate, "00:00");
    throw new Error("Event time is required.");
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/[zZ+]/.test(value)) {
    const [datePart, timePart = "00:00"] = value.split("T");
    return toManilaIsoTimestamp(datePart, timePart.slice(0, 5));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid event timestamp: ${value}`);
  }
  return parsed.toISOString();
}

function manilaDateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function assertSameManilaDay(startAt: string, endAt: string) {
  if (manilaDateKey(startAt) !== manilaDateKey(endAt)) {
    throw new Error("Start and end must fall on the same date (Asia/Manila).");
  }
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw new Error("End time must be after start time.");
  }
}

function mapEroomError(status: number, payload: unknown): EroomReserveCreateResult {
  const body =
    payload && typeof payload === "object"
      ? (payload as { error?: string; message?: string; details?: string })
      : {};
  const message =
    String(body.error || body.message || "").trim() ||
    (status === 401
      ? "eRoomReserve rejected the shared secret."
      : status === 404
        ? "eRoomReserve could not match the organizer email or room name."
        : status === 409
          ? "Room name matches more than one eRoomReserve room."
          : status === 400
            ? "eRoomReserve rejected the reservation payload."
            : "eRoomReserve could not create the reservation.");

  return {
    ok: false,
    status,
    error: message,
    details: body.details ? String(body.details) : undefined,
  };
}

export async function createEroomReserveReservation(
  input: EroomReserveCreateInput,
): Promise<EroomReserveCreateResult> {
  const apiUrl = String(process.env.EROOMRESERVE_RESERVATIONS_URL || "").trim();
  const secret = String(process.env.DC_SPACE_RESERVATION_CREATE_SECRET || "").trim();

  if (!apiUrl || !secret) {
    return {
      ok: false,
      status: 503,
      error:
        "eRoomReserve is not configured. Set EROOMRESERVE_RESERVATIONS_URL and DC_SPACE_RESERVATION_CREATE_SECRET.",
    };
  }

  const payload: Record<string, string> = {
    dcSpaceEventId: input.dcSpaceEventId.trim(),
    eventTitle: input.eventTitle.trim(),
    startAt: input.startAt,
    endAt: input.endAt,
    requestedByEmail: input.requestedByEmail.trim().toLowerCase(),
    locationLabel: input.locationLabel.trim(),
  };
  const advisorEmail = String(input.advisorEmail || "").trim().toLowerCase();
  if (advisorEmail) payload.advisorEmail = advisorEmail;

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (res.status === 201 || res.status === 200) {
      const body = (data || {}) as {
        reservationId?: string;
        dcSpaceEventId?: string;
        ok?: boolean;
      };
      const reservationId = String(body.reservationId || "").trim();
      if (!reservationId) {
        return {
          ok: false,
          status: 502,
          error: "eRoomReserve did not return a reservationId.",
        };
      }
      return {
        ok: true,
        reservationId,
        dcSpaceEventId: String(body.dcSpaceEventId || input.dcSpaceEventId),
        reused: res.status === 200,
      };
    }

    return mapEroomError(res.status, data);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      status: 502,
      error: "Could not reach eRoomReserve.",
      details,
    };
  }
}
