import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  AttendanceError,
  recordRfidScan,
} from "@/lib/user-server/record-attendance";

/** Admin RFID scanner — validates registered tag, toggles tap in/out. */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { eventId?: string; rfidNumber?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  const rfidNumber = String(body.rfidNumber || "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }
  if (!rfidNumber) {
    return NextResponse.json({ error: "rfidNumber is required." }, { status: 400 });
  }

  try {
    const result = await recordRfidScan({
      eventId,
      rfidNumber,
      actor: {
        email: auth.session.email,
        name: auth.session.name,
        role: auth.session.role,
      },
    });

    return NextResponse.json(
      {
        scan: result,
        message:
          result.action === "in"
            ? `${result.participantName} tapped in.`
            : `${result.participantName} tapped out.`,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof AttendanceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to record RFID scan.", details },
      { status: 500 },
    );
  }
}
