import { NextResponse } from "next/server";
import {
  loadFeedbackAnalytics,
  type FeedbackAnalyticsFilters,
} from "@/lib/admin/feedback-analytics";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

function parsePeriod(value: string | null): FeedbackAnalyticsFilters["period"] {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "");
  if (normalized === "today") return "today";
  if (normalized === "week" || normalized === "thisweek") return "week";
  if (normalized === "month" || normalized === "thismonth") return "month";
  if (normalized === "year" || normalized === "thisyear") return "year";
  if (normalized === "all" || normalized === "alltime") return "all";
  return "all";
}

/** Admin feedback analytics from real user submissions in MongoDB. */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filters: FeedbackAnalyticsFilters = {
      period: parsePeriod(searchParams.get("period")),
      date: String(searchParams.get("date") || "").trim(),
      organization: String(searchParams.get("organization") || "").trim(),
      course: String(searchParams.get("course") || "").trim(),
      eventId: String(searchParams.get("eventId") || "").trim(),
    };
    const analytics = await loadFeedbackAnalytics(filters);
    return NextResponse.json(analytics);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load feedback analytics.", details },
      { status: 500 },
    );
  }
}
