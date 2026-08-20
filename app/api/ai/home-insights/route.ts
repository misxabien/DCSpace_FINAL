import { NextResponse } from "next/server";
import { loadCampusAiContext } from "@/lib/ai/context";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const context = await loadCampusAiContext(10);
    const result = await generateGeminiJson<{
      items?: Array<{ title?: string; body?: string; tone?: string }>;
    }>(
      `You are DC Space admin home AI. Return JSON only:
{"items":[{"title":"...","body":"one sentence","tone":"blue|yellow|red"}]}
Give 3 or 4 short operational insights from this snapshot. Use red only for real risk (pending pile-up, live events with no attendance, etc).

${JSON.stringify(context, null, 2)}`,
      `home-insights:${context.totals.pending}:${context.totals.live}:${context.totals.completed}:${context.totals.attendanceCount}:${context.totals.feedbackCount}`,
    );

    const items = Array.isArray(result.items)
      ? result.items
          .map((item) => ({
            title: String(item.title || "AI insight").trim(),
            body: String(item.body || "").trim(),
            tone: ["blue", "yellow", "red"].includes(String(item.tone))
              ? String(item.tone)
              : "blue",
          }))
          .filter((item) => item.body)
          .slice(0, 4)
      : [];

    return NextResponse.json({ items });
  } catch (error) {
    const mapped = geminiErrorResponse(error);
    return NextResponse.json(
      { error: mapped.error, details: "details" in mapped ? mapped.details : undefined, code: "code" in mapped ? mapped.code : undefined },
      { status: mapped.status },
    );
  }
}
