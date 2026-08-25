import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { buildLiveAttendanceFeed } from "@/lib/user-server/record-attendance";

/** Admin RFID scanner — records explicit Tap In or Tap Out. */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") || "";
  const light = url.searchParams.get("light") === "1";
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }

  try {
    const feed = await buildLiveAttendanceFeed(eventId, { light });
    return NextResponse.json(feed);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load live attendance.", details },
      { status: 500 },
    );
  }
}
