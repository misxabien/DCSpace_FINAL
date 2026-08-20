import { NextResponse } from "next/server";
import { loadStudentAiContext } from "@/lib/ai/context";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import { requireSessionActor } from "@/lib/user-server/session-auth";

export async function GET(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const context = await loadStudentAiContext(actor.email);
    const allowedIds = new Set(context.upcomingEvents.map((event) => event.id));
    const result = await generateGeminiJson<{
      insight?: string;
      recommendedEventIds?: unknown;
    }>(
      `You are DC Space, a campus events assistant for SDCA students in the Philippines.
Return JSON only:
{"insight":"one friendly sentence about what to join next","recommendedEventIds":["id"]}
Rules:
- Recommend at most 3 upcoming event ids from the list.
- Prefer events matching the student's course or organization.
- If the list is empty, say they can check back when new events are posted.
- Do not invent event ids or student names beyond the provided name.

Student:
${JSON.stringify(context, null, 2)}`,
      `student-home:${actor.email}:${context.upcomingEvents.map((event) => event.id).join(",")}`,
    );

    const recommendedEventIds = Array.isArray(result.recommendedEventIds)
      ? result.recommendedEventIds
          .map((id) => String(id).trim())
          .filter((id) => allowedIds.has(id))
          .slice(0, 3)
      : [];

    return NextResponse.json({
      insight: String(result.insight || "").trim(),
      recommendedEventIds,
    });
  } catch (error) {
    const mapped = geminiErrorResponse(error);
    return NextResponse.json(
      {
        error: mapped.error,
        details: "details" in mapped ? mapped.details : undefined,
        code: "code" in mapped ? mapped.code : undefined,
      },
      { status: mapped.status },
    );
  }
}
