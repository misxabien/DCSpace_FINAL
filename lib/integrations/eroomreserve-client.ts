/**
 * HTTP client for DC Space → eRoomReserve reservation create.
 * Endpoint: EROOMRESERVE_RESERVATIONS_URL
 * Auth: Bearer DC_SPACE_RESERVATION_CREATE_SECRET
 */

export type EroomCreateReservationInput = {
  dcSpaceEventId: string;
  eventTitle: string;
  startAt: string;
  endAt: string;
  requestedByEmail: string;
  requestedByName?: string;
  locationLabel: string;
  purpose?: string;
  department?: string;
  venueType?: string;
};

export type EroomCreateReservationResult = {
  ok: boolean;
  reservationId: string;
  status?: string;
  openUrl: string;
  skipped?: boolean;
  error?: string;
  code?: string;
  raw?: unknown;
};

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

export function getEroomReserveAppUrl() {
  return (
    readEnv("EROOMRESERVE_APP_URL") ||
    readEnv("IROOM_APP_URL") ||
    "https://eroomreserve.vercel.app"
  );
}

export function getEroomReserveReservationsUrl() {
  return (
    readEnv("EROOMRESERVE_RESERVATIONS_URL") ||
    "https://eroomreserve.vercel.app/api/integrations/dc-space/reservations"
  );
}

export function buildEroomReserveOpenUrl(input: {
  eventId: string;
  reservationId?: string;
}) {
  try {
    const url = new URL(getEroomReserveAppUrl());
    url.searchParams.set("dcSpaceEventId", input.eventId);
    url.searchParams.set("source", "dcspace");
    if (input.reservationId) {
      url.searchParams.set("reservationId", input.reservationId);
    }
    return url.toString();
  } catch {
    return getEroomReserveAppUrl();
  }
}

/**
 * Event times are saved from `datetime-local` inputs as Philippine wall-clock
 * time with no zone (e.g. "2026-11-23T16:00"). eRoomReserve only accepts full
 * ISO datetimes, so send UTC ("2026-11-23T08:00:00.000Z"). The Philippines has
 * no daylight saving, so a fixed +08:00 offset is exact.
 */
const EVENT_TIME_OFFSET = "+08:00";

export function toEroomIsoDatetime(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "";
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text);
  const withSeconds = /T\d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
  const date = new Date(hasZone ? text : `${withSeconds}${EVENT_TIME_OFFSET}`);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function extractReservationId(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  const nested =
    data.reservation && typeof data.reservation === "object"
      ? (data.reservation as Record<string, unknown>)
      : null;
  const candidates = [
    data.reservationId,
    data.id,
    nested?.reservationId,
    nested?.id,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

/** Create (or refresh) a room reservation in eRoomReserve for a DC Space event. */
export async function createEroomReserveReservation(
  input: EroomCreateReservationInput,
): Promise<EroomCreateReservationResult> {
  const url = getEroomReserveReservationsUrl();
  const secret = readEnv("DC_SPACE_RESERVATION_CREATE_SECRET");
  const provisionalId = `dcspace-${input.dcSpaceEventId}`;
  const openUrl = buildEroomReserveOpenUrl({
    eventId: input.dcSpaceEventId,
    reservationId: provisionalId,
  });

  if (!secret) {
    return {
      ok: false,
      reservationId: provisionalId,
      openUrl,
      skipped: true,
      error: "DC_SPACE_RESERVATION_CREATE_SECRET is not configured.",
      code: "missing_secret",
    };
  }

  const body = {
    dcSpaceEventId: input.dcSpaceEventId,
    eventTitle: input.eventTitle,
    startAt: toEroomIsoDatetime(input.startAt),
    endAt: toEroomIsoDatetime(input.endAt),
    requestedByEmail: input.requestedByEmail.toLowerCase(),
    requestedByName: input.requestedByName || "",
    locationLabel: input.locationLabel || "On Campus",
    purpose: input.purpose || "",
    department: input.department || "",
    venueType: input.venueType || "On Campus",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const raw = await res.json().catch(() => ({}));
    const reservationId = extractReservationId(raw, provisionalId);
    const finalOpenUrl = buildEroomReserveOpenUrl({
      eventId: input.dcSpaceEventId,
      reservationId,
    });

    if (!res.ok) {
      const err =
        raw && typeof raw === "object"
          ? (raw as { error?: { message?: string; code?: string } | string }).error
          : null;
      const baseMessage =
        typeof err === "string"
          ? err
          : err && typeof err === "object"
            ? String(err.message || "eRoomReserve rejected the reservation.")
            : `eRoomReserve returned HTTP ${res.status}`;
      // Validation errors carry the useful part in details.fieldErrors.
      const fieldErrors =
        err && typeof err === "object"
          ? (err as { details?: { fieldErrors?: Record<string, unknown> } }).details
              ?.fieldErrors
          : undefined;
      const fieldSummary = fieldErrors
        ? Object.entries(fieldErrors)
            .map(([field, problems]) =>
              `${field}: ${Array.isArray(problems) ? problems.join(", ") : String(problems)}`,
            )
            .join("; ")
        : "";
      const message = fieldSummary ? `${baseMessage} (${fieldSummary})` : baseMessage;
      const code =
        err && typeof err === "object" ? String(err.code || "") : String(res.status);

      return {
        ok: false,
        reservationId: provisionalId,
        openUrl: finalOpenUrl,
        error: message,
        code,
        raw,
      };
    }

    const status =
      raw && typeof raw === "object"
        ? String(
            (raw as { status?: string; reservation?: { status?: string } }).status ||
              (raw as { reservation?: { status?: string } }).reservation?.status ||
              "pending",
          )
        : "pending";

    return {
      ok: true,
      reservationId,
      status,
      openUrl: finalOpenUrl,
      raw,
    };
  } catch (error) {
    return {
      ok: false,
      reservationId: provisionalId,
      openUrl,
      error: error instanceof Error ? error.message : "Network error calling eRoomReserve.",
      code: "network_error",
    };
  }
}
