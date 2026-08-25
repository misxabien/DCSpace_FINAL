import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { loadUserAiContext } from "@/lib/ai/context";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { buildUserAttendanceSummary } from "@/lib/user-server/attendance-summary";
import { getUserDb } from "@/lib/user-server/get-user-db";

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = String(body.userId || "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  try {
    const context = await loadUserAiContext(userId);
    if (!context) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    let email = "";
    if (ObjectId.isValid(userId)) {
      const db = await getUserDb();
      const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
      email = String(user?.email || "").toLowerCase();
    }
    const attendanceSummary = await buildUserAttendanceSummary(email);

    try {
      const result = await generateGeminiJson<{
        attendanceReliability?: number;
        participationScore?: number;
        rfidAlerts?: string;
        recommendedReview?: string;
      }>(
        `You are DC Space admin AI reviewing one campus user. Return JSON only:
{
  "attendanceReliability": 0,
  "participationScore": 0,
  "rfidAlerts": "None|Low|Review",
  "recommendedReview": "2 sentences for admins"
}
attendanceReliability is 0-100. participationScore is 0-100.
Use the stats; if history is thin, keep scores moderate and say so.

Data:
${JSON.stringify({ ...context, attendanceSummary }, null, 2)}`,
        `user-insights:${userId}:${attendanceSummary.eventsAttended}:${attendanceSummary.registrations}:${context.stats.certificates}`,
      );

      return NextResponse.json({
        userId,
        attendanceReliability: Number(
          result.attendanceReliability || attendanceSummary.attendanceRate || 0,
        ),
        participationScore: Number(result.participationScore || 0),
        rfidAlerts: String(result.rfidAlerts || "None"),
        recommendedReview: String(result.recommendedReview || ""),
        attendanceSummary,
      });
    } catch (error) {
      const mapped = geminiErrorResponse(error);
      // Still return live attendance summary when Gemini is unavailable.
      return NextResponse.json(
        {
          userId,
          attendanceReliability: attendanceSummary.attendanceRate,
          participationScore: Math.min(
            100,
            attendanceSummary.attendanceCompleted * 10 + attendanceSummary.eventsAttended * 5,
          ),
          rfidAlerts:
            attendanceSummary.lateRecords + attendanceSummary.undertimeRecords > 3
              ? "Review"
              : attendanceSummary.lateRecords + attendanceSummary.undertimeRecords > 0
                ? "Low"
                : "None",
          recommendedReview:
            attendanceSummary.registrations === 0 && attendanceSummary.eventsAttended === 0
              ? `${context.user.name || "This user"} has no recorded registrations or attendance yet.`
              : `${context.user.name || "This user"} attended ${attendanceSummary.eventsAttended} of ${attendanceSummary.registrations} registered event(s) (${attendanceSummary.attendanceRate}% rate). ${attendanceSummary.undertimeRecords} undertime and ${attendanceSummary.absences} absence record(s) were detected.`,
          attendanceSummary,
          aiUnavailable: true,
          error: mapped.error,
        },
        { status: 200 },
      );
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load user insights.", details },
      { status: 500 },
    );
  }
}
