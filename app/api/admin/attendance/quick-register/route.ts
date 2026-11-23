import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { AttendanceError } from "@/lib/user-server/record-attendance";
import { quickRegisterAndTapIn } from "@/lib/user-server/quick-register";

/**
 * RFID desk "Quick Register on First Tap": create the student's account (or link
 * the card to their existing account), link the card, register them for the
 * event and record the tap-in — in one request.
 */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }

  try {
    const { created, scan } = await quickRegisterAndTapIn({
      eventId,
      rfidNumber: String(body.rfidNumber || ""),
      firstName: String(body.firstName || ""),
      lastName: String(body.lastName || ""),
      studentNumber: String(body.studentNumber || ""),
      email: String(body.email || ""),
      privacyConsent: body.privacyConsent === true,
      actor: {
        email: auth.session.email,
        name: auth.session.name,
        role: auth.session.role,
      },
    });

    console.info(
      `[DC Space] Quick Register ${created ? "created account" : "linked card"} for event ${eventId} by ${auth.session.email}`,
    );
    return NextResponse.json(
      {
        created,
        scan,
        user: scan.user,
        message: created
          ? `${scan.participantName} registered and tapped in.`
          : `Card linked to ${scan.participantName}'s account and tapped in.`,
      },
      { status: 201 },
    );
  } catch (error) {
    console.warn(
      `[DC Space] Quick Register failed for event ${eventId}:`,
      error instanceof AttendanceError ? `${error.code} — ${error.message}` : error,
    );
    if (error instanceof AttendanceError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.user ? { user: error.user } : {}),
        },
        { status: error.status },
      );
    }
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Quick registration failed.", details },
      { status: 500 },
    );
  }
}
