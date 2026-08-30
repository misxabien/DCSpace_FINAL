import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { buildEventParticipantList } from "@/lib/user-server/event-participants";

/** Admin participant attendance list for listp44 (registrations + taps + security flags). */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const eventId = new URL(request.url).searchParams.get("eventId") || "";
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }

  try {
    const payload = await buildEventParticipantList(eventId);
    return NextResponse.json(payload);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load participant attendance.", details },
      { status: 500 },
    );
  }
}
