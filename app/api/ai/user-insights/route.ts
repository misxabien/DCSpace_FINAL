import { NextResponse } from "next/server";
import { loadUserAiContext } from "@/lib/ai/context";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

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
${JSON.stringify(context, null, 2)}`,
      `user-insights:${userId}:${context.stats.attendanceRecords}:${context.stats.registrations}:${context.stats.certificates}`,
    );

    return NextResponse.json({
      userId,
      attendanceReliability: Number(result.attendanceReliability || 0),
      participationScore: Number(result.participationScore || 0),
      rfidAlerts: String(result.rfidAlerts || "None"),
      recommendedReview: String(result.recommendedReview || ""),
    });
  } catch (error) {
    const mapped = geminiErrorResponse(error);
    return NextResponse.json(
      { error: mapped.error, details: "details" in mapped ? mapped.details : undefined, code: "code" in mapped ? mapped.code : undefined },
      { status: mapped.status },
    );
  }
}
