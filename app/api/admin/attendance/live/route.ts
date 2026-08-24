import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { buildLiveAttendanceFeed } from "@/lib/user-server/record-attendance";

/** Real-time attendance feed for admin RFID console. */
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
    const feed = await buildLiveAttendanceFeed(eventId);
    return NextResponse.json(feed);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load live attendance.", details },
      { status: 500 },
    );
  }
}
